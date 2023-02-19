import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { electroluxACAccessory } from './platformAccessory';
import * as broadlink from 'node-broadlink';

/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
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

    // When this event is fired it means Homebridge has restored all cached accessories from disk.
    // Dynamic Platform plugins should only register new accessories after this event was fired,
    // in order to ensure they weren't added to homebridge already. This event can also be used
    // to start discovery of new accessories.
    this.api.on('didFinishLaunching', () => {
      log.debug('Executed didFinishLaunching callback');
      // run the method to discover / register your devices as accessories
      this.discoverDevices();
    });
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to setup event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);

    // add the restored accessory to the accessories cache so we can track if it has already been registered
    this.accessories.push(accessory);
  }

  /**
   * This is an example method showing how to register discovered accessories.
   * Accessories must only be registered once, previously created accessories
   * must not be registered again to prevent "duplicate UUID" errors.
   */

  async discoverDevices() {

    //
    // NEW SECTION USING BROADLINK
    //
    this.log.info('Running Broadlink Discovery...:', this.config.name);
    const discoveredACDevices = await broadlink.discover();
    for (const acDevice of discoveredACDevices) {


      this.log.info('Broadlink AC found:', acDevice.name, acDevice.deviceType);

      /*
      const macAsString: string = macToHex(acDevice.mac).join(':').toString();

      this.log.info('Broadlink AC mac:', acDevice.mac.toString());
      this.log.info('Broadlink AC mac:', acDevice.mac[0].toString(16));
      this.log.info('Broadlink AC mac:', acDevice.mac[0].toString(10));

      this.log.debug('DEBUG: Broadlink AC name:', acDevice.name.toString());
      this.log.debug('DEBUG: creating electroluxAC object:', acDevice.name.toString());
*/
      this.log.info('DEBUG: starting auth:', acDevice.name.toString(), acDevice.host.address);

      await acDevice.auth();


      this.log.info('DEBUG: finished auth:', acDevice.name.toString(), acDevice.host);
      this.log.info(
        'Registed new Electrolux AC',
        acDevice.name.toString(),
        acDevice.deviceType.toString(16),
        acDevice.host,
        acDevice.mac,
      );

      // this.log.debug('DEBUG: Broadlink AC model:', acDevice.model.toString());
      // this.log.debug('DEBUG: Broadlink AC host:', acDevice.host[0].toString());
      // this.log.debug('DEBUG: Broadlink AC mac:', acDevice.mac.toString());

      // create UUID from mac address
      const uuid = this.api.hap.uuid.generate(acDevice.mac.toString());

      // check for that same uuid, maybe we discovered already
      const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);
      if (existingAccessory) {
        this.log.info('Found known Electrolux AC:', existingAccessory.displayName);
        this.log.debug('DEBUG: Found known Electrolux AC:', existingAccessory.displayName);

      } else {
        // the accessory does not yet exist, so we need to create it
        this.log.info('Adding new Electrolux AC:', acDevice.name, acDevice.mac);

        // create a new accessory
        const accessory = new this.api.platformAccessory(acDevice.name, uuid);


        // store a copy of the device object in the `accessory.context`
        // the `context` property can be used to store any data about the accessory you may need
        accessory.context.device = acDevice;
        accessory.context.model = acDevice.deviceType.toString(16) ?? 'Electrolux Broadlink AC';
        accessory.context.manufacturer = 'Electrolux Family';
        accessory.context.serial = acDevice.deviceType.toString(16) ?? 'Electrolux Broadlink AC';

        // create the accessory handler for the newly create accessory
        // this is imported from `platformAccessory.ts`

        // this works
        new electroluxACAccessory(this, accessory);

        // link the accessory to your platform
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
    }
  }
}