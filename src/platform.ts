import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';
import { ElectroluxBroadlinkPlatformConfig, namedDevice } from './types';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { electroluxACAccessory } from './platformAccessory';
import * as broadlink from 'node-broadlink';
import Device from 'node-broadlink/dist/device';




export class ElectroluxBroadlinkACPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;
  public readonly config: ElectroluxBroadlinkPlatformConfig;
  //public readonly config: PlatformConfig;

  // this is used to track restored cached accessories
  public readonly accessories: PlatformAccessory[] = [];

  constructor(
    public readonly log: Logger,
    config: PlatformConfig,
    public readonly api: API,
  ) {
    this.config = config as ElectroluxBroadlinkPlatformConfig;


    this.log.debug('Finished initializing platform:', this.config.name);

    this.api.on('didFinishLaunching', () => {
      log.debug('Executed didFinishLaunching callback');
      // run the method to discover / register your devices as accessories
      this.discoverDevices();

    });
  }


  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);

    // add the restored accessory to the accessories cache so we can track if it has already been registered
    this.accessories.push(accessory);
    this.log.debug('Finished loading from cache');
  }


  async butFirstDiscover(): Promise<Device[]> {
    let discoveredACDevices:Device[] = [];
    const searches = 5;
    for (let i = 1; searches; i++) {
      this.log.info('Running Broadlink Discovery #', i, ' of a possible ', searches);
      discoveredACDevices = await broadlink.discover();

      if (discoveredACDevices.length >= this.accessories.length && discoveredACDevices.length > 0) {
        this.log.info('Expected to see at least', this.accessories.length, ' devices, saw ',
          discoveredACDevices.length, '. Looking good.');
        break;
      }
      this.log.info('Expected to see at least', this.accessories.length, ' devices, saw ',
        discoveredACDevices.length, '. Lets try again in 5 seconds.');
      await new Promise(f => setTimeout(f, 5000));
    }
    return discoveredACDevices;
  }


  getDeviceConfig(device: Device): namedDevice | undefined {
    if (this.config.namedDevices) {
      for (const namedDev of this.config.namedDevices) {
        this.log.debug( '\n Trying to match up =', this.getMAC(device).toLowerCase() ?? ' missing',
          '= to =', namedDev.macAddress?.toLowerCase() ?? 'missing', '=');
        if (this.getMAC(device).toLowerCase() === namedDev.macAddress?.toLowerCase()) {
          this.log.info('\n Renaming: ', device.name, ' with mac [', this.getMAC(device), '] to ', namedDev.name);
          return namedDev;
        }
      }
    }
    return undefined;
  }


  getMAC(device: Device): string {
    const mac = device.mac.map(x => x.toString(16).padStart(2, '0'));
    const mac2 = mac.reverse();
    return mac2.join(':');
  }

  getSerial(device: Device): string {
    const mac = device.mac.map(x => x.toString(16).padStart(2, '0'));
    const mac2 = mac.reverse();
    return mac2.join('');
  }


  getUUID(device: Device): string {
    const uuid = this.api.hap.uuid.generate(this.getMAC(device));
    return uuid;
  }

  isDeviceTypeElectrolux(device: Device): boolean {
    const defDevices:string[] = ['0x4f9b'];
    let allowed:string[] = [];
    if (this.config?.allowedDevices) {
      allowed = defDevices.concat(this.config.allowedDevices);
    }

    if (allowed.includes('0x'.concat(device.deviceType?.toString(16) ?? ''))) {
      return true;
    }
    return false;
  }


  async getCachedAccessory(device: Device): Promise<PlatformAccessory | undefined> {
    const cachedAccessory = this.accessories.find(accessory => accessory.UUID === this.getUUID(device));
    if (cachedAccessory) {
      return cachedAccessory;
    }
    return undefined;
  }


  async doAccessorySetup(acDevice: Device, accessory: PlatformAccessory): Promise<boolean> {
    this.log.info('Authenticating to:', acDevice.name, ' at ', acDevice.host.address);
    const authenticatedDevice = await acDevice.auth();
    if (authenticatedDevice) {
      this.log.info('Authentication SUCCESS:', acDevice.name, ' at ', acDevice.host.address);
      accessory.context.device = authenticatedDevice;

      const deviceConfig = this.getDeviceConfig(acDevice) ?? undefined;
      accessory.displayName = deviceConfig?.name ?? authenticatedDevice.name;
      accessory.context.model = deviceConfig?.model ?? 'Electrolux Family AC';
      accessory.context.manufacturer = deviceConfig?.manufacturer ?? 'Electrolux';
      accessory.context.serial = this.getSerial(authenticatedDevice);


      const logmsg = ''.concat(
        '\nName         : ', accessory.displayName ?? 'missing',
        '\nModel        : ', accessory.context.model ?? 'missing',
        '\nManufacturer : ', accessory.context.manufacturer ?? 'missing',
        '\nSerial No    : ', accessory.context.serial ?? 'missing',
        '\nUUID         : ', accessory.UUID ?? 'missing',
        '\nDevice Type  : ', '0x'.concat(accessory.context.device?.deviceType?.toString(16) ?? 'missing'),
        '\nMac Address  : [', this.getMAC(authenticatedDevice) ?? 'missing', ']',
        '\nIP Address   : ', accessory.context.device?.host?.address ?? 'missing');

      this.log.info('Setting up :', logmsg);


      // Create the handler instance
      new electroluxACAccessory(this, accessory, this.config);

      return true;

    } else {
      this.log.info('FAILED to authenticate to :', acDevice.name ?? 'missing', ' at ', acDevice.host?.address ?? 'missing');
      return false;
    }
  }



  async discoverDevices() {

    const discoveredDevices = await this.butFirstDiscover();

    for (const dev of discoveredDevices) {
      if (this.isDeviceTypeElectrolux(dev)) {
        const acc = await this.getCachedAccessory(dev);
        if (acc) {

          // set up previous created accessory
          await this.doAccessorySetup(dev, acc);

        } else {

          // create a new accessory
          const newAcc = new this.api.platformAccessory(dev.name, this.getUUID(dev));

          // now set it up
          await this.doAccessorySetup(dev, newAcc);

          // register it
          this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [newAcc]);

        }

      } else {
        this.log.info('Skipping adding ', dev.name.toString(), ' at ', dev.host.address,
          ' because it has an unsupported Device Type :', '0x'.concat(dev.deviceType.toString(16)));
      }
    }
  }
}