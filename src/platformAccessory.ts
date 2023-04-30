import { PlatformConfig, Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { ElectroluxBroadlinkACPlatform } from './platform';
import { ElectroluxBroadlinkPlatformConfig } from './types';

export enum fanSpeed {
  AUTO = 0,
  LOW = 1,
  MED = 2,
  HIGH = 3,
  TURBO = 4,
  QUIET = 5
}

export enum acMode {
  COOL = 0,
  HEAT = 1,
  DRY = 2,
  FAN = 3,
  AUTO = 4,
  HEAT_8 = 6
}

export enum isAC {
  active = 1,
  fanBlowing = 2,

  autoOn = 3,
  quietAutoOn = 4,
  fanModeOn = 5,
  dryModeOn = 6,
  fanSwingOn = 7,
  selfCleanOn = 8,
  fanSpeedQuiet = 11,

  displayOn = 9,
  fanSpeedAuto = 10,

}

export enum getAC {
  currentState = 1,
  fanCurrentState = 2,

  targetState = 3,
  fanTargetState = 4,

  fanSpeedPercent = 5,
  fanSpeedName = 6,

  acModeName = 7,

}







// this sets up the json references for data and commands
export interface ElectroluxState<T = boolean | number> {

  // 0 or 1 for homekit
  ac_pwr: number;                    // power duh
  ac_vdir: number;                   // vertical swing

  // boolean for homekit
  scrdisp: T;                       //  LED display
  qtmode: T;                    // beep on (tied to scrdisp, so kinda pointless)
  mldprf: T;                    // self clean

  // non boolean variables for homekit
  ac_mark: number;              // Fan speed auto 0, low 1, med 2, high 3, turbo 4, quiet 5
  ac_mode: number;              // AC Mode cool 0, heat 1, dry 2, fan 3, auto 4, heat_8 6;
  drmode: number;               // possible way of monitoring heating vs cooling, 0=heat, 4=cool?
  temp: number;                 // Target temp
  envtemp: number;              // Ambient temp

  // purely informational, bool, string for ease
  ac_heaterstatus: T;
  ac_indoorfanstatus: T;
  ac_compressorstatus: T;
  modelnumber: string;

}








export class electroluxACAccessory {
  // private service: Service;
  private fan: Service;
  private thermostat: Service;

  private readonly platform: ElectroluxBroadlinkACPlatform;
  private readonly accessory: PlatformAccessory;
  private readonly config: ElectroluxBroadlinkPlatformConfig;

  // extra configurable switches:

  // specific aircon modes
  private swAuto?: Service;
  private swQuietAuto?: Service;
  private swFanMode?: Service;
  private swDryMode?: Service;
  private swFanQuiet?: Service;
  // aircon functions
  private swClean?: Service;
  private swFanSwing?: Service;
  // display/beep
  private swDisplay?: Service;
  private swDeBeep?: Service;



  private swDefaults = {
    swAuto: true,
    swQuietAuto: false,
    swFanMode: false,
    swDryMode: false,
    swFanQuiet: true,
    //
    swClean: false,
    swFanSwing: false,
    //
    swDisplay: true,
    swDeBeep: false,
  };



  //public TYPE = 'ELECTROLUX_OEM';
  //public deviceType = 0x4f9b;
  public staleTimeout = 200;      // how old the stored AC state can get
  public updateIntervalSeconds = 5;   // interval for async updates
  public updateInterval = 5000;
  public LowTempLimit = 17;
  public HighTempLimit = 30;

  private acStateCache = {
    ac_pwr: 0,
    ac_vdir: 0,

    scrdisp: false,
    qtmode: false,
    mldprf: false,

    ac_mark: 0,
    ac_mode: 4,
    temp: 24,
    envtemp: 24,
    drmode: 4,

    ac_heaterstatus: false,
    ac_indoorfanstatus: false,
    ac_compressorstatus: false,
    modelnumber: 'x',
  } as ElectroluxState;  // primes the cache

  private lastSuccessfulGet = 1;







  constructor(
    platform: ElectroluxBroadlinkACPlatform,
    accessory: PlatformAccessory,
    config: PlatformConfig,

  ) {
    this.config = config as ElectroluxBroadlinkPlatformConfig;
    this.platform = platform;
    this.accessory = accessory;

    accessory.context.deBeepState as boolean;

    this.staleTimeout = this.config.minRequestFrequency ?? 200;      // how old the stored AC state can get
    this.updateIntervalSeconds = this.config.updateInterval ?? 5;   // interval for async updates
    this.updateInterval = this.updateIntervalSeconds * 1000;

    let setUpMsg = ''.concat(this.accessory.displayName, '  Configuration:',
      '\nMax time between reads     : ', this.staleTimeout.toString(), ' ms',
      '\nUpdate Interval            : ', this.updateIntervalSeconds.toString(), ' s');

    // optional switches
    setUpMsg = setUpMsg.concat(
      '\nExpose Auto switch         : ', this.platform.config.auto?.toString() ?? 'Not set');
    setUpMsg = setUpMsg.concat(
      '\nExpose Self Clean Switch   : ', this.platform.config.selfClean?.toString() ?? 'Not set');
    setUpMsg = setUpMsg.concat(
      '\nExpose LED (Beep) Switch   : ', this.platform.config.display?.toString() ?? 'Not set');
    setUpMsg = setUpMsg.concat(
      '\nExpose Fan Swing Switch    : ', this.platform.config.fanSwing?.toString() ?? 'Not set');
    setUpMsg = setUpMsg.concat(
      '\nExpose Quiet Auto Switch   : ', this.platform.config.quietAuto?.toString() ?? 'Not set');
    setUpMsg = setUpMsg.concat(
      '\nExpose De-Beep             : ', this.platform.config.deBeep?.toString() ?? 'Not set');
    setUpMsg = setUpMsg.concat(
      '\nExpose Fan Mode Switch     : ', this.platform.config.fanMode?.toString() ?? 'Not set');
    setUpMsg = setUpMsg.concat(
      '\nExpose Dry Mode Switch     : ', this.platform.config.dryMode?.toString() ?? 'Not set');

    // dumps variables and optional switch config to console
    this.platform.log.info(setUpMsg);








    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, this.accessory.context.manufacturer as string)
      .setCharacteristic(this.platform.Characteristic.Model, this.accessory.context.model)
      .setCharacteristic(this.platform.Characteristic.SerialNumber, accessory.context.serial as string);

    // Create the 2 services for the accessory
    this.thermostat = this.accessory.getService(this.platform.Service.Thermostat) ||
    this.accessory.addService(this.platform.Service.Thermostat, ''.concat(this.accessory.displayName, ' AC'))
      .setCharacteristic(this.platform.Characteristic.ConfiguredName, ''.concat(this.accessory.displayName, ' AC'));

    this.fan = this.accessory.getService(this.platform.Service.Fanv2) ||
    this.accessory.addService(this.platform.Service.Fanv2, ''.concat(this.accessory.displayName, ' Fan'))
      .setCharacteristic(this.platform.Characteristic.ConfiguredName, ''.concat(this.accessory.displayName, ' Fan'));

    // set to celsius
    this.thermostat.setCharacteristic(this.platform.Characteristic.TemperatureDisplayUnits, 0);








    // ######## Thermostat Handlers ##########

    this.thermostat.getCharacteristic(this.platform.Characteristic.CurrentHeatingCoolingState);
    // .onGet(this.handleGetCurrentState.bind(this));

    this.thermostat.getCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState)
      //.onGet(this.handleGetTargetState.bind(this))
      .onSet(this.handleSetTargetState.bind(this));

    this.thermostat.getCharacteristic(this.platform.Characteristic.CurrentTemperature);
    //.onGet(this.handleGetCurrentTemp.bind(this));

    this.thermostat.getCharacteristic(this.platform.Characteristic.TargetTemperature)
      //.onGet(this.handleGetTargetTemp.bind(this))
      .onSet(this.handleSetTargetTemp.bind(this));







    // ######## Fan Handlers ##########

    // on / off
    this.fan.getCharacteristic(this.platform.Characteristic.Active)
      // .onGet(this.xhandleGetActive.bind(this))
      .onSet(this.handleSetFanMode.bind(this));

    // current state ( inactive, idle, blowing_air )
    //                    0    /  1  /    2
    this.fan.getCharacteristic(this.platform.Characteristic.CurrentFanState);
    // .onGet(this.handleGetFanCurrentState.bind(this));

    // target state is fan auto speed or not
    this.fan.getCharacteristic(this.platform.Characteristic.TargetFanState)
      // .onGet(this.handleGetFanTargetState.bind(this))
      .onSet(this.handleSetFanTargetState.bind(this));

    this.fan.getCharacteristic(this.platform.Characteristic.SwingMode)
      //.onGet(this.handleGetSwingMode.bind(this))
      .onSet(this.handleSetSwingMode.bind(this));

    this.fan.getCharacteristic(this.platform.Characteristic.RotationSpeed)
      //.onGet(this.handleGetRotationSpeed.bind(this))
      .onSet(this.handleSetRotationSpeed.bind(this));








    // ####### Switch Handlers ########

    if (this.platform.config.auto as boolean === true || this.swDefaults.swAuto) {
      this.swAuto = this.accessory.getService('AC Auto') ||
    this.accessory.addService(this.platform.Service.Switch, 'AC Auto', 'AC Auto')
      .setCharacteristic(this.platform.Characteristic.ConfiguredName, 'AC Auto');
      this.swAuto.getCharacteristic(this.platform.Characteristic.On)
        .onSet(this.handleSetAuto.bind(this));
    } else {
      this.swAuto = this.accessory.getService('AC Auto') || undefined;
      if (this.swAuto) {
        this.accessory.removeService(this.swAuto);
      }
    }

    if (this.platform.config.selfClean as boolean === true || this.swDefaults.swClean) {
      this.swClean = this.accessory.getService('AC Self Clean') ||
    this.accessory.addService(this.platform.Service.Switch, 'AC Self Clean', 'AC Self Clean')
      .setCharacteristic(this.platform.Characteristic.ConfiguredName, 'AC Self Clean');
      this.swClean.getCharacteristic(this.platform.Characteristic.On)
        .onSet(this.handleSetSelfClean.bind(this));
    } else {
      this.swClean = this.accessory.getService('AC Self Clean') || undefined;
      if (this.swClean) {
        this.accessory.removeService(this.swClean);
      }
    }

    if (this.platform.config.display as boolean === true || this.swDefaults.swDisplay) {
      this.swDisplay = this.accessory.getService('AC LED') ||
    this.accessory.addService(this.platform.Service.Switch, 'AC LED', 'AC LED')
      .setCharacteristic(this.platform.Characteristic.ConfiguredName, 'AC LED');
      //this.swDisplay.setCharacteristic(this.platform.Characteristic.Name, 'LED Display');
      this.swDisplay.getCharacteristic(this.platform.Characteristic.On)
        .onSet(this.handleSetDisplay.bind(this));
    } else {
      this.swDisplay = this.accessory.getService('AC LED') || undefined;
      if (this.swDisplay) {
        this.accessory.removeService(this.swDisplay);
      }
    }

    if (this.platform.config.fanSwing as boolean === true || this.swDefaults.swFanSwing) {
      this.swFanSwing = this.accessory.getService('AC Fan Swing') ||
      this.accessory.addService(this.platform.Service.Switch, 'AC Fan Swing', 'AC Fan Swing')
        .setCharacteristic(this.platform.Characteristic.ConfiguredName, 'AC Fan Swing');
      //this.swFanSwing.setCharacteristic(this.platform.Characteristic.Name, 'Fan Swing');
      this.swFanSwing.getCharacteristic(this.platform.Characteristic.On)
        .onSet(this.handleSetSwingModeSwitch.bind(this));
    } else {
      this.swFanSwing = this.accessory.getService('AC Fan Swing') || undefined;
      if (this.swFanSwing) {
        this.accessory.removeService(this.swFanSwing);
      }
    }

    if (this.platform.config.quietAuto as boolean === true || this.swDefaults.swQuietAuto) {
      this.swQuietAuto = this.accessory.getService('AC Quiet Auto') ||
        this.accessory.addService(this.platform.Service.Switch, 'AC Quiet Auto', 'AC Quiet Auto')
          .setCharacteristic(this.platform.Characteristic.ConfiguredName, 'AC Quiet Auto');
      //this.swQuietAuto.setCharacteristic(this.platform.Characteristic.Name, 'Quiet Auto');
      this.swQuietAuto.getCharacteristic(this.platform.Characteristic.On)
        .onSet(this.handleSetQuietAuto.bind(this));
    } else {
      this.swQuietAuto = this.accessory.getService('AC Quiet Auto') || undefined;
      if (this.swQuietAuto) {
        this.accessory.removeService(this.swQuietAuto);
      }
    }

    if (this.platform.config.deBeep as boolean === true || this.swDefaults.swDeBeep) {
      this.swDeBeep = this.accessory.getService('AC De-Beep') ||
        this.accessory.addService(this.platform.Service.Switch, 'AC De-Beep', 'AC De-Beep')
          .setCharacteristic(this.platform.Characteristic.ConfiguredName, 'AC De-Beep');
      this.swDeBeep.getCharacteristic(this.platform.Characteristic.On)
        .onSet(this.handleSetDeBeepState.bind(this));
    } else {
      this.swDeBeep = this.accessory.getService('AC De-Beep') || undefined;
      if (this.swDeBeep) {
        this.accessory.removeService(this.swDeBeep);
      }
    }

    if (this.platform.config.fanMode as boolean === true || this.swDefaults.swFanMode) {
      this.swFanMode = this.accessory.getService('AC Fan Mode') ||
        this.accessory.addService(this.platform.Service.Switch, 'AC Fan Mode', 'AC Fan Mode')
          .setCharacteristic(this.platform.Characteristic.ConfiguredName, 'AC Fan Mode');
      this.swFanMode.getCharacteristic(this.platform.Characteristic.On)
        .onSet(this.handleSetFanMode.bind(this));
    } else {
      this.swFanMode = this.accessory.getService('AC Fan Mode') || undefined;
      if (this.swFanMode) {
        this.accessory.removeService(this.swFanMode);
      }
    }


    if (this.platform.config.dryMode as boolean === true || this.swDefaults.swDryMode) {
      this.swDryMode = this.accessory.getService('AC Dry Mode') ||
        this.accessory.addService(this.platform.Service.Switch, 'AC Dry Mode', 'AC Dry Mode')
          .setCharacteristic(this.platform.Characteristic.ConfiguredName, 'AC Dry Mode');
      this.swDryMode.getCharacteristic(this.platform.Characteristic.On)
        .onSet(this.handleSetDryMode.bind(this));
    } else {
      this.swDryMode = this.accessory.getService('AC Dry Mode') || undefined;
      if (this.swDryMode) {
        this.accessory.removeService(this.swDryMode);
      }
    }


    if (this.platform.config.fanQuiet as boolean === true || this.swDefaults.swFanQuiet) {
      this.swFanQuiet = this.accessory.getService('Fan Quiet') ||
        this.accessory.addService(this.platform.Service.Switch, 'Fan Quiet', 'Fan Quiet')
          .setCharacteristic(this.platform.Characteristic.ConfiguredName, 'Fan Quiet');
      this.swFanQuiet.getCharacteristic(this.platform.Characteristic.On)
        .onSet(this.handleSetFanQuiet.bind(this));
    } else {
      this.swFanQuiet = this.accessory.getService('Fan Quiet') || undefined;
      if (this.swFanQuiet) {
        this.accessory.removeService(this.swFanQuiet);
      }
    }








    // ##### Asynchrounous updates, at regular interval #####

    // should chain promises here!!
    setInterval(async () => {
      // const status:ElectroluxState = await this.checkLive();
      await this.updateAllNow(await this.checkLive());
    }, this.updateInterval);

    setInterval(async () => {
      this.platform.log.info(this.genLogMsg(await this.getState()));
    }, 1800000);
  }








  // update all characteristics
  public async updateAllNow(status: ElectroluxState): Promise<void> {



    // This one gets to update direct , so still has the .OnGet handler, we dont need it here
    this.thermostat.getCharacteristic(this.platform.Characteristic.
      CurrentHeatingCoolingState).updateValue(this.fromStatusGet(status, getAC.currentState));


    this.thermostat.getCharacteristic(this.platform.Characteristic.
      TargetHeatingCoolingState).updateValue(this.fromStatusGet(status, getAC.targetState));


    this.thermostat.getCharacteristic(this.platform.Characteristic.
      CurrentTemperature).updateValue(status.envtemp);

    this.thermostat.getCharacteristic(this.platform.Characteristic.
      TargetTemperature).updateValue(status.temp);

    this.fan.getCharacteristic(this.platform.Characteristic.
      Active).updateValue(status.ac_indoorfanstatus);

    this.fan.getCharacteristic(this.platform.Characteristic.
      CurrentFanState).updateValue(this.fromStatusGet(status, getAC.fanCurrentState));

    // whether fan speed is auto or not
    this.fan.getCharacteristic(this.platform.Characteristic.
      TargetFanState).updateValue(status.ac_mark === 0);

    this.fan.getCharacteristic(this.platform.Characteristic.
      SwingMode).updateValue(status.ac_vdir);

    this.fan.getCharacteristic(this.platform.Characteristic.
      RotationSpeed).updateValue(this.fromStatusGet(status, getAC.fanSpeedPercent));




    // optional switches

    if (this.swAuto) {
      this.swAuto?.getCharacteristic(this.platform.Characteristic.
        On).updateValue(status.ac_pwr === 1 && status.ac_mode === acMode.AUTO && status.ac_mark === fanSpeed.AUTO);
    }

    if (this.swClean) {
      this.swClean.getCharacteristic(this.platform.Characteristic.
        On).updateValue(status.mldprf);
    }

    if (this.swDisplay) {
      this.swDisplay.getCharacteristic(this.platform.Characteristic.
        On).updateValue(status.scrdisp);
    }

    if (this.swFanSwing) {
      this.swFanSwing.getCharacteristic(this.platform.Characteristic.
        On).updateValue(status.ac_vdir === 1);
    }

    if (this.swQuietAuto) {
      this.swQuietAuto.getCharacteristic(this.platform.Characteristic.
        On).updateValue(status.ac_pwr === 1 && status.ac_mode === acMode.AUTO && status.ac_mark === fanSpeed.QUIET);
    }

    if (this.swFanMode) {
      this.swFanMode.getCharacteristic(this.platform.Characteristic.
        On).updateValue(status.ac_mode === acMode.FAN);
    }

    if (this.swDryMode) {
      this.swDryMode.getCharacteristic(this.platform.Characteristic.
        On).updateValue(status.ac_mode === acMode.DRY);
    // On).updateValue(this.fromStatusIs(status, isAC.dryModeOn, true));
    }

    if (this.swFanQuiet) {
      this.swFanQuiet.getCharacteristic(this.platform.Characteristic.
        On).updateValue(status.ac_mark === fanSpeed.QUIET);
    }

  }




  private genLogMsg(status: ElectroluxState): string {

    return ''.concat(this.accessory.displayName, ' Status :',
      '\n On : ', status.ac_pwr.toString(),
      ',  Mode : ', this.fromACModeGetModeName(status.ac_mode),
      ',  Compressor : ', status.ac_compressorstatus.toString(),
      ',  Drmode : ', status.drmode.toString(),
      '\n Fan On : ', status.ac_indoorfanstatus.toString(),
      ',  Fan Speed : ', this.fromACMarkGetSpeedName(status.ac_mark),
      ',  Swing : ', this.acStateCache.ac_vdir.toString(),
      '\n Env Temp : ', status.envtemp.toString(),
      ',  Set Temp : ', status.temp.toString(),
    );
  }


  private async setState(state: Partial<ElectroluxState>): Promise<ElectroluxState> {
    // this.platform.log.debug('setState() called', JSON.stringify(state));
    return new Promise((resolve, reject) => {
      this.accessory.context.device.sendPacket(this.encode(state))
        .then((encryptedResponse) => {
          const decryptedResponse = this.accessory.context.device.decrypt(encryptedResponse);
          this.lastSuccessfulGet = Date.now();
          this.acStateCache = (this.decode(decryptedResponse));

          //this.platform.log.debug('\n setState() called, updated cache and returning this JSON from AC:\n',
          //  JSON.stringify(this.acStateCache));

          this.platform.log.info(this.accessory.displayName, ' Status :',
            ' Power: ', this.acStateCache.ac_pwr,
            ', Ambient Temp: ', this.acStateCache.envtemp,
            ',\n Target Temp: ', this.acStateCache.temp,
            ', AC Mode: ', this.fromACModeGetModeName(this.acStateCache.ac_mode),
            ', Fan Mode: ', this.fromACMarkGetSpeedName(this.acStateCache.ac_mark),
            ', Fan Swing: ', this.acStateCache.ac_vdir,
            ', Display: ', this.acStateCache.scrdisp,
          );
          resolve(this.acStateCache);
        })
        .catch((err) => {

          reject(err);
        });
    });
  }


  // this is the promise that each get will run
  // idea being that it will only send a get request when there isnt already one
  private async getState(): Promise<ElectroluxState>{
    if ((this.lastSuccessfulGet + this.staleTimeout) < Date.now()) {
      return this.checkLive();
    } else {
      return this.checkCache();
    }
  }

  private async checkCache(): Promise<ElectroluxState> {
    return new Promise((resolve) => {
      resolve(this.checkCacheACState());
    });
  }

  private async checkLive(): Promise<ElectroluxState> {
    return new Promise((resolve) => {
      resolve(this.checkLiveACState());
    });
  }

  private async checkLiveACState(): Promise<ElectroluxState> {
    // this.platform.log.debug('checkLiveACState() called');
    const encryptedResponse = await this.accessory.context.device.sendPacket(this.encode({}));
    const decryptedResponse = await this.accessory.context.device.decrypt(encryptedResponse);
    // this.platform.log.debug('decrypted response: ', decryptedResponse.toString('ascii'));
    const state = this.decode(decryptedResponse);
    this.lastSuccessfulGet = Date.now();
    this.acStateCache = state;
    // this.platform.log.debug('\n checkLiveACState() called, updated cache with this JSON:\n',
    //   JSON.stringify(this.acStateCache));

    return state;
  }

  private async checkCacheACState(): Promise<ElectroluxState> {
    // this.platform.log.debug('\n checkcacheACState() called, responding with this from cache:\n',
    //   JSON.stringify(this.acStateCache));
    return this.acStateCache;
  }

  // specific to 0x4f9b Electrolux/Kelvinator ACs
  protected encode(state: Partial<ElectroluxState>): Buffer {
    // this.platform.log.debug('encode() called');
    // create data payload
    const data = JSON.stringify(this.getValue(state, Number));
    // packet length is 14 bytes + length of data payload
    const packet = Buffer.alloc(0xE + data.length);
    // 0x00, 0x01, length of data payload not inc these 2 bytes
    packet.writeUIntLE(12 + data.length, 0x00, 2);
    // 0x02, 0x03, 0x04 0x05, 0xa5a55a5a, connection id
    packet.fill('a5a55a5a', 0x02, 0x06, 'hex');
    packet.writeUIntLE(((data.length <= 2)? 0x01 : 0x02), 0x08, 2); // Length
    // 0x9, "0x0b", 2 bytes, little endian
    packet.writeUIntLE(0x0b, 0x09, 2);
    // 0xA, 0xB, length, 2 bytes, little endian
    packet.writeUIntLE(data.length, 0xA, 2);
    // write out the rest of the packet with ascii data (from JSON)
    packet.write(data, 0xE, 'ascii');
    // checksum calc
    const d_Checksum = (packet.subarray(0x08).reduce((a, b) => a + b, 0) + 0xC0AD) & 0xFFFF;
    // 0x06, 0x07, checksum 2 bytes, little endian
    packet.writeUIntLE(d_Checksum, 0x06, 2);
    return packet;
  }

  // specific to 0x4f9b Electrolux/Kelvinator ACs
  protected encodeName(name: string): Buffer {
    // this.platform.log.debug('encodeName() called');

    // create data payload, 80 bytes, all zeros
    const packet = Buffer.alloc(80, 0);

    packet.write(name.substring(0, 64), 0x5, 'ascii');

    return packet;
  }

  protected decode(payload: Buffer): ElectroluxState {
    // this.platform.log.debug('decode() called \n "', payload.subarray(0x0e).toString('ascii'), '"');
    try {
      return this.getValue(
        JSON.parse(
          payload.subarray(0x0e, 0x0e + payload.readInt16LE(0x0a)).toString('ascii'),
        ) as ElectroluxState<number>,
        Boolean,
      ) as ElectroluxState;
    } catch (error) {
      this.platform.log.debug('Error parsing JSON:\n', error, payload.subarray(0x0e).toString('ascii'));
      this.platform.log.debug('JSON string length:\n', error, payload.subarray(0x0e).toString('ascii').length);
      this.platform.log.debug('Payload length (from packet):\n', payload.readInt16LE(0x0a));

      return JSON.parse('{}');
    }


  }

  protected getValue<I extends number | boolean, O extends number | boolean>(
    state: Partial<ElectroluxState<I>>,
    Number: (value: I) => O,
  ): Partial<ElectroluxState<O>> {
    return {

      // homekit uses 1 or 0 for these
      ac_pwr: state.ac_pwr,
      ac_vdir: state.ac_vdir,

      // bool for homekit
      scrdisp: state.scrdisp !== undefined ? Number(state.scrdisp) : undefined,
      qtmode: state.qtmode !== undefined ? Number(state.qtmode) : undefined,
      mldprf: state.mldprf !== undefined ? Number(state.mldprf) : undefined,

      // bool for ease
      ac_heaterstatus: state.ac_heaterstatus !== undefined ? Number(state.ac_heaterstatus) : undefined,
      ac_indoorfanstatus: state.ac_indoorfanstatus !== undefined ? Number(state.ac_indoorfanstatus) : undefined,
      ac_compressorstatus: state.ac_compressorstatus !== undefined ? Number(state.ac_compressorstatus) : undefined,

      // number ranges for these
      ac_mode: state.ac_mode,
      ac_mark: state.ac_mark,
      temp: state.temp,
      envtemp: state.envtemp,
      drmode: state.drmode,

      // string here
      modelnumber: state.modelnumber,
    };
  }



  // here just to trigger a cache refresh
  public async handleGetCurrentState(): Promise<CharacteristicValue> {
    return this.fromStatusGet(await this.getState(), getAC.currentState);
  }


  // takes Homekit setting of OFF / AUTO / HEAT / COOL
  // either sets AC off, or translates to ac mode integer
  public async handleSetTargetState(value: CharacteristicValue): Promise<void> {
    if (value === this.platform.Characteristic.TargetHeatingCoolingState.OFF) {
      this.platform.log.info('Setting AC Mode to OFF' );
      await this.setState({ ac_pwr: 0 });
    } else {
      const ac_mode = this.fromHKTargetStateGetACMode(value as number);
      this.platform.log.info('HK Requested ', value, ', Setting AC Mode to ', this.fromACModeGetModeName(ac_mode) );
      await this.setState({ ac_mode });
      if (this.accessory.context.deBeepState) {
        await this.setState({ scrdisp: 0 });
      }
    }
  }

  // setting fan to 'On' enables Fan mode on the AC, and sets fan auto mode
  // setting to off turns off the AC


  // for the dedicated Fan Mode switch configurable in settings
  public async handleSetFanMode(value: CharacteristicValue): Promise<void> {
    if (value) {
      this.platform.log.info('Setting AC to Fan Mode');
      await this.setState({ ac_mode: 3 });
      if (this.accessory.context.deBeepState) {
        await this.setState({ scrdisp: 0 });
      }
    } else {
      this.platform.log.info('Setting AC (via Fan Mode switch) Off');
      await this.setState({ ac_pwr: 0 });
    }
  }


  // for the dedicated Fan Mode switch configurable in settings
  public async handleSetDryMode(value: CharacteristicValue): Promise<void> {
    if (value) {
      this.platform.log.info('Setting AC to Dry Mode');
      await this.setState({ ac_mode: 2 });
      if (this.accessory.context.deBeepState) {
        await this.setState({ scrdisp: 0 });
      }
    } else {
      this.platform.log.info('Setting AC (via Dry Mode switch) Off');
      await this.setState({ ac_pwr: 0 });
    }
  }

  // fan speed, auto or manual
  public async handleSetFanTargetState(value: CharacteristicValue): Promise<void> {
    if (value === this.platform.Characteristic.TargetFanState.AUTO) {
      this.platform.log.info('Setting Fan Target State (Speed) to Auto');
      await this.setState({ ac_mark: 0 });

    } else {
      this.platform.log.info('Setting Fan Target State (Speed) to Manual');

    }
  }

  // this is a number value from homekit
  public async handleSetSwingMode(value: CharacteristicValue): Promise<void> {
    this.platform.log.info(' Setting Fan Swing : ', value);
    await this.setState({ ac_vdir: value as number});
  }

  // this is for the dedicated switch, and Homekit gives a boolean request
  public async handleSetSwingModeSwitch(value: CharacteristicValue): Promise<void> {
    this.platform.log.info(' Setting Fan Swing : ', value);
    await this.setState({ ac_vdir: value as boolean ? 1 : 0 });
  }

  // this is for the dedicated switch, and Homekit gives a boolean request
  public async handleSetFanQuiet(value: CharacteristicValue): Promise<void> {
    this.platform.log.info(' Setting Fan Speed to Quiet : ', value);
    await this.setState({ ac_mark: value as boolean ? 5 : 0 });
  }

  public async handleSetRotationSpeed(value: CharacteristicValue): Promise<void> {
    this.platform.log.info('Setting Fanspeed to ', value);
    await this.setState({ ac_mark: this.fromFanPercentGetACMark(value as number) });
  }

  public async handleSetTargetTemp(value: CharacteristicValue): Promise<void> {
    this.platform.log.info(`'Setting Target Temp to ${value}'`);
    await this.setState({ temp: value as number });
  }

  public async handleSetDisplay(value: CharacteristicValue): Promise<void> {
    this.platform.log.info(' Setting display :', value);
    await this.setState({ scrdisp: value as boolean });
  }

  public async handleSetSelfClean(value: CharacteristicValue): Promise<void> {
    this.platform.log.info(' Setting Self Clean :', value);
    await this.setState({ mldprf: value as boolean });
  }

  // sets auto, and turning off powers off
  public async handleSetAuto(value: CharacteristicValue): Promise<void> {
    if (value) {
      await this.setState({ ac_mode: acMode.AUTO });
      if (this.accessory.context.deBeepState) {
        await this.setState({ scrdisp: 0 });
      }
      await this.setState({ ac_mark: fanSpeed.AUTO });
    } else if (!value) {
      await this.setState({ ac_pwr: 0 });
      if (this.accessory.context.deBeepState) {
        await this.setState({ scrdisp: 0 });
      }
    }
    this.platform.log.info(' Setting Auto mode :', value);
  }

  // sets auto, and turning off powers off
  public async handleSetQuietAuto(value: CharacteristicValue): Promise<void> {
    if (value) {
      // const response =
      await this.setState({ ac_mode: acMode.AUTO });
      if (this.accessory.context.deBeepState) {
        await this.setState({ scrdisp: 0 });
      }
      await this.setState({ ac_mark: fanSpeed.QUIET });
      // this.updateAll(response);
    } else if (!value) {
      // const response =
      await this.setState({ ac_pwr: 0 });
      if (this.accessory.context.deBeepState) {
        await this.setState({ scrdisp: 0 });
      }
      // this.updateAll(response);
    }
    this.platform.log.info(' Setting Quiet-Auto mode :', value);
  }



  public async handleSetDeBeepState(value: CharacteristicValue): Promise<void> {
    this.accessory.context.deBeepState = value as boolean;
  }


  public async handleGetDeBeepState(): Promise<boolean> {
    return this.accessory.context.deBeepState ?? false;
  }






  public fromStatusGet(status: ElectroluxState, which: getAC): number{
    let response = 0;
    switch (which) {

      case getAC.currentState: {
        if (!status.ac_compressorstatus || status.ac_mode === acMode.FAN) {
          response = this.platform.Characteristic.CurrentHeatingCoolingState.OFF;
        } else if (status.ac_mode === acMode.COOL || status.ac_mode === acMode.DRY) {
          response = this.platform.Characteristic.CurrentHeatingCoolingState.COOL;
        } else if (status.ac_mode === acMode.HEAT || status.ac_mode === acMode.HEAT_8) {
          response = this.platform.Characteristic.CurrentHeatingCoolingState.HEAT;
        } else if (status.ac_mode === acMode.AUTO && status.drmode === 4) {
          response = this.platform.Characteristic.CurrentHeatingCoolingState.COOL;
        } else if (status.ac_mode === acMode.AUTO && status.drmode === 0) {
          response = this.platform.Characteristic.CurrentHeatingCoolingState.HEAT;
        } else {
          response = this.platform.Characteristic.CurrentHeatingCoolingState.OFF;
        }
        break;
      }

      case getAC.targetState: {
        if (status.ac_pwr === 0) {
          response = this.platform.Characteristic.TargetHeatingCoolingState.OFF;
        } else if (status.ac_mode === acMode.AUTO) {
          response = this.platform.Characteristic.TargetHeatingCoolingState.AUTO;
        } else if (status.ac_mode === acMode.HEAT || status.ac_mode === acMode.HEAT_8) {
          response = this.platform.Characteristic.TargetHeatingCoolingState.HEAT;
        } else if (status.ac_mode === acMode.COOL) {
          response = this.platform.Characteristic.TargetHeatingCoolingState.COOL;
        } else {
          response = this.platform.Characteristic.TargetHeatingCoolingState.OFF;
        }
        break;
      }

      case getAC.fanCurrentState: {
        if (status.ac_indoorfanstatus === 1) {
          response = this.platform.Characteristic.CurrentFanState.BLOWING_AIR;
        } else if (status.ac_pwr === 1) {
          response = this.platform.Characteristic.CurrentFanState.IDLE;
        } else {
          response = this.platform.Characteristic.CurrentFanState.INACTIVE;
        }
        break;
      }


      case getAC.fanSpeedPercent: {
        response = this.fromACMarkGetFanPercent(status.ac_mark);
        break;
      }

    }

    return response;
  }







  // translates a homekit TargetState constant to the matching AC Mode
  public fromHKTargetStateGetACMode(targetState: number): number {
    let targetACMode = this.platform.Characteristic.TargetHeatingCoolingState.AUTO;
    switch (targetState) {
      case this.platform.Characteristic.TargetHeatingCoolingState.AUTO: {
        targetACMode = acMode.AUTO;
        break;
      }
      case this.platform.Characteristic.TargetHeatingCoolingState.HEAT: {
        targetACMode = acMode.HEAT;
        break;
      }
      case this.platform.Characteristic.TargetHeatingCoolingState.COOL: {
        targetACMode = acMode.COOL;
        break;
      }
      default: {
        targetACMode = this.platform.Characteristic.TargetHeatingCoolingState.AUTO;
      }
    }
    return targetACMode;
  }





  // AC Mode cool 0, heat 1, dry 2, fan 3, auto 4, heat_8 6
  protected fromACModeGetModeName(mode: number | undefined): string {
    switch (mode) {
      case 0: {
        return 'Cool';
      }
      case 1: {
        return 'Heat';
      }
      case 2: {
        return 'Dry';
      }
      case 3: {
        return 'Fan';
      }
      case 4: {
        return 'Auto';
      }
      case 6: {
        return 'Heat 8';
      }
      default: {
        return 'Unknown';
      }
    }
  }

  // Fan speed auto 0, low 1, med 2, high 3, turbo 4, quiet 5
  protected fromACMarkGetSpeedName(mark: number | undefined): string {
    switch (mark) {
      case 0: {
        return 'Auto';
      }
      case 1: {
        return 'Low';
      }
      case 2: {
        return 'Medium';
      }
      case 3: {
        return 'High';
      }
      case 4: {
        return 'Turbo';
      }
      case 5: {
        return 'Quiet';
      }
      default: {
        return 'Unknown';
      }
    }
  }




  public fromFanPercentGetACMark(percent: number): number {
    let ac_mark = fanSpeed.AUTO; // default
    if (percent > 0 && percent <20) {
      // 1 - 19% Quiet
      ac_mark = fanSpeed.QUIET;
    } else if (percent >=20 && percent <40 ) {
      // low 20 - 39
      ac_mark = fanSpeed.LOW;
    } else if (percent >=40 && percent <60) {
      // med 40 - 59
      ac_mark = fanSpeed.MED;
    } else if (percent >=60 && percent <80) {
      // high 60 - 79
      ac_mark = fanSpeed.HIGH;
    } else if (percent >=80) {
      // turbo 80 - 99
      ac_mark = fanSpeed.TURBO;
    }
    return ac_mark;
  }


  public fromACMarkGetFanPercent(ac_mark: number): number {
    let percent = 100;
    switch (ac_mark) {
      case fanSpeed.AUTO: {
        percent = 100;
        break;
      }
      case fanSpeed.QUIET: {
        percent = 10;
        break;
      }
      case fanSpeed.LOW: {
        percent = 30;
        break;
      }
      case fanSpeed.MED: {
        percent = 50;
        break;
      }
      case fanSpeed.HIGH: {
        percent = 70;
        break;
      }
      case fanSpeed.TURBO: {
        percent = 90;
        break;
      }
      default: {
        percent = 100;
      }
    }
    return percent;
  }



}


