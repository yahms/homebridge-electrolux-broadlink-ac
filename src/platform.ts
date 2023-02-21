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

    /*
    this.log.debug('Searching for ', accessory.displayName);
    const discoveredDevices = await broadlink.discover();
    this.log.debug('Searching for ', accessory.displayName, ' from a total of ', discoveredDevices.length);
    discoveredDevices.finally()
    for (const acDevice of discoveredDevices.then()) {

      // create UUID from mac address
      const uuid = this.api.hap.uuid.generate(acDevice.mac.map(x => x.toString(16).padStart(2, '0')).join(':'));

      // this.log.debug('comparing:', acDevice.mac, ' and ', accessory.context.device.mac);
      this.log.debug('comparing: ===', accessory.UUID, '=== and ===', uuid, '===');
      if (accessory.UUID === uuid) {
        this.log.info('Found ', accessory.displayName, ' at ', acDevice.host.address);
        this.log.debug('attempting recreate of cached accesssory:', accessory.displayName);
        await acDevice.auth();
        accessory.context.device = acDevice;

        // create the accessory handler for the newly create accessory
        new electroluxACAccessory(this, accessory);
        this.log.debug('finished attempting recreating:', accessory.displayName);
      } // if
    } // for
*/

    // add the restored accessory to the accessories cache so we can track if it has already been registered
    this.accessories.push(accessory);
    this.log.debug('Finished loading from cache');
  }

  async discoverDevices() {

    const allowedDevices:Array<string> = ['0x4f9b'];

    this.log.info('Waiting to run discovery...:', this.config.name);
    await new Promise(f => setTimeout(f, 2000));
    this.log.info('Running Broadlink Discovery...:', this.config.name);
    let discoveredACDevices = await broadlink.discover();
    if (discoveredACDevices.length === 0) {
      this.log.info('Nothing found, waiting a bit and trying again...:', this.config.name);
      await new Promise(f => setTimeout(f, 5000));
      discoveredACDevices = await broadlink.discover();
    }
    this.log.info('Discovered ', discoveredACDevices.length, ' devices!');



    for (const acDevice of discoveredACDevices) {
      this.log.debug(
        `'Found Broadlink Device':
      Name       : ${acDevice.name.toString()}
      IP  addr   : ${acDevice.host.address}:${acDevice.host.port}
      Mac addr   : ${acDevice.mac.map(x => x.toString(16).padStart(2, '0')).join(':')}
      Device ID  : 0x${acDevice.deviceType.toString(16)}'`);

      if (allowedDevices.includes('0x'.concat(acDevice.deviceType.toString(16)))) {
        this.log.info('Broadlink Device at IP: ', acDevice.host.address, ' is an Electrolux AC!');

        // create UUID from mac address
        const uuid = this.api.hap.uuid.generate(acDevice.mac.map(x => x.toString(16).padStart(2, '0')).join(':'));

        // check for that same uuid, maybe we discovered already
        const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);
        this.log.debug('going to try match: =', uuid, '= with =', existingAccessory?.UUID);

        if (existingAccessory) {
          this.log.debug('matched: ===', existingAccessory.UUID, '=== with ===', uuid, '===');
          this.log.info(`Recognised known Electrolux AC '${acDevice.name.toString()}' as
           ${existingAccessory.displayName}'`); // cached name

          await acDevice.auth();

          existingAccessory.context.device = acDevice;

          new electroluxACAccessory(this, existingAccessory);

          this.log.debug('finished setup of existing accessory');
        } else {
        // the accessory does not yet exist, so we need to create it
          this.log.info(`'Adding New Electrolux AC '${acDevice.name.toString()} at ${acDevice.host.address}'`);

          this.log.debug('DEBUG: starting auth:', acDevice.name.toString(), acDevice.host.address);
          await acDevice.auth();
          this.log.debug('DEBUG: finished auth:', acDevice.name.toString(), acDevice.host);
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
          this.log.debug('DEBUG: finished setting up new accessory', acDevice.name.toString(), acDevice.host.address);
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