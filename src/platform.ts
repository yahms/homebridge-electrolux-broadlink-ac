import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { electroluxACAccessory } from './platformAccessory';
import * as broadlink from 'node-broadlink';



export class ElectroluxBroadlinkACPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

  // this is used to track restored cached accessories
  public readonly accessories: PlatformAccessory[] = [];

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
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
  }

  async discoverDevices() {

    //
    // NEW SECTION USING BROADLINK
    //
    this.log.info('Running Broadlink Discovery...:', this.config.name);

    const allowedDevices:Array<string> = ['0x4f9b'];

    const discoveredACDevices = await broadlink.discover();
    for (const acDevice of discoveredACDevices) {
      this.log.info(
        `'Found Broadlink Device':
      Name       : ${acDevice.name.toString()}
      IP  addr   : ${acDevice.host.address}:${acDevice.host.port}
      Mac addr   : ${acDevice.mac.map(x => x.toString(16).padStart(2, '0')).join(':')}
      Device ID  : 0x${acDevice.deviceType.toString(16)}'`);


      if (allowedDevices.includes('0x'.concat(acDevice.deviceType.toString(16)))) {

        this.log.info('Broadlink Device at IP: ', acDevice.host.address, ' is an Electrolux AC!');

        this.log.debug('DEBUG: starting auth:', acDevice.name.toString(), acDevice.host.address);
        await acDevice.auth();
        this.log.debug('DEBUG: finished auth:', acDevice.name.toString(), acDevice.host);


        // create UUID from mac address
        const uuid = this.api.hap.uuid.generate(acDevice.mac.map(x => x.toString(16).padStart(2, '0')).join(':'));

        // check for that same uuid, maybe we discovered already
        const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);
        if (existingAccessory) {
          this.log.info(`Recognised known Electrolux AC '${acDevice.name.toString()}'
           ${existingAccessory.displayName}'`); // cached name

          // store an updated copy of the Device object on the accessory
          // to ensure we have updated auth details when calls to the Device class are made
          existingAccessory.context.device = acDevice;

        } else {
        // the accessory does not yet exist, so we need to create it
          this.log.info(`'Adding New Electrolux AC '${acDevice.name.toString()} at ${acDevice.host.address}'`);

          // create a new accessory
          const accessory = new this.api.platformAccessory(acDevice.name, uuid);


          // store a copy of the device object in the `accessory.context`
          // the `context` property can be used to store any data about the accessory you may need
          accessory.context.device = acDevice;
          accessory.context.model = 'model';
          accessory.context.manufacturer = 'Electrolux';
          accessory.context.serial = '0x'.concat(acDevice.deviceType.toString(16));

          // create the accessory handler for the newly create accessory
          new electroluxACAccessory(this, accessory);

          // link the accessory to the platform
          this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        }
      } else {
        this.log.debug(
          `'Broadlink device is not an Electrolux AC, or Device ID is not in Allowed Devices in Config.JSON':
        Name       : ${acDevice.name.toString()}
        IP  addr   : ${acDevice.host.address}:${acDevice.host.port}
        Mac addr   : ${acDevice.mac.map(x => x.toString(16).padStart(2, '0')).join(':')}
        Device ID  : 0x${acDevice.deviceType.toString(16)}'`);
      }
    }
  }
}