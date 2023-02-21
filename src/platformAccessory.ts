import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { ElectroluxBroadlinkACPlatform } from './platform';

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

// this sets up the json references for data and commands
export interface ElectroluxState<T = boolean | number> {

  // boolean
  ac_pwr: number;                    // Power
  scrdisp: T;                   // LED display
  qtmode: number;                    // beep on (tied to scrdisp, so kinda pointless)
  ac_vdir: number;                   // vertical swing
  mldprf: number;                    // self clean

  // non boolean variables
  ac_mark: number;              // Fan speed auto 0, low 1, med 2, high 3, turbo 4, quiet 5
  ac_mode: number;              // AC Mode cool 0, heat 1, dry 2, fan 3, auto 4, heat_8 6
  temp: number;                 // Target temp
  envtemp: number;              // Ambient temp

  // purely informational
  ac_heaterstatus: T;
  ac_indoorfanstatus: T;
  ac_compressorstatus: T;
  modelnumber: string;
}


export class electroluxACAccessory {
  private service: Service;
  private swClean: Service;
  private swDisplay: Service;
  private swAuto: Service;

  public TYPE = 'ELECTROLUX_OEM';
  public deviceType = 0x4f9b;
  public staleTimeout = 200;      // how old the stored AC state can get
  public updateInterval = 5000;   // interval for async updates
  public LowTempLimit = 17;
  public HighTempLimit = 30;

  private acStateCache = {
    ac_pwr: 0,
    scrdisp: 0,
    qtmode: 0,
    ac_vdir: 0,
    mldprf: 0,
    ac_mark: 0,
    ac_mode: 4,
    temp: 24,
    envtemp: 24,
    ac_heaterstatus: false,
    ac_indoorfanstatus: false,
    ac_compressorstatus: false,
    modelnumber: 'x',
  } as ElectroluxState;  // primes the cache

  private lastSuccessfulGet = 1;

  constructor(
    private readonly platform: ElectroluxBroadlinkACPlatform,
    private readonly accessory: PlatformAccessory,
  ) {




    if (this.platform.config.minRequestFrequency) {
      this.staleTimeout = this.platform.config.minRequestFrequency;
      this.platform.log.debug('Setting staleTimeout from config.json :', this.platform.config.minRequestFrequency);
    }


    if (this.platform.config.UpdateFrequency) {
      this.updateInterval = this.platform.config.UpdateFrequency;
      this.platform.log.debug('Setting updateFrequency from config.json :', this.platform.config.UpdateFrequency);
    }




    this.getModel().then(value => accessory.context.model = value);

    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, accessory.context.manufacturer as string)
      .setCharacteristic(this.platform.Characteristic.Model, accessory.context.model)
      .setCharacteristic(this.platform.Characteristic.SerialNumber, accessory.context.serial as string);


    // get the  service if it exists, otherwise create a new  service
    // you can create multiple services for each accessory
    this.service = this.accessory.getService(this.platform.Service.HeaterCooler) ||
    this.accessory.addService(this.platform.Service.HeaterCooler);

    // add additional switches for clean/display/auto
    this.swClean = this.accessory.getService('Self Clean') ||
    this.accessory.addService(this.platform.Service.Switch, 'Self Clean', 'swClean');
    this.swClean.setCharacteristic(this.platform.Characteristic.Name, 'Self Clean');

    this.swDisplay = this.accessory.getService('LED Display') ||
    this.accessory.addService(this.platform.Service.Switch, 'LED Display', 'swDisplay');
    this.swDisplay.setCharacteristic(this.platform.Characteristic.Name, 'LED Display');

    this.swAuto = this.accessory.getService('Auto') ||
    this.accessory.addService(this.platform.Service.Switch, 'Auto', 'swAuto');
    this.swAuto.setCharacteristic(this.platform.Characteristic.Name, 'Auto');

    // default name on the Home app
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.name);
    /*
    this.service.getCharacteristic(this.platform.Characteristic.CoolingThresholdTemperature).props.minValue = 17;
    this.service.getCharacteristic(this.platform.Characteristic.CoolingThresholdTemperature).props.maxValue = 30;
    this.service.getCharacteristic(this.platform.Characteristic.HeatingThresholdTemperature).props.minValue = 17;
    this.service.getCharacteristic(this.platform.Characteristic.HeatingThresholdTemperature).props.maxValue = 30;
*/
    this.service.getCharacteristic(this.platform.Characteristic.CoolingThresholdTemperature).props.minStep = 1;
    this.service.getCharacteristic(this.platform.Characteristic.HeatingThresholdTemperature).props.minStep = 1;


    // create handlers for required characteristics
    this.service.getCharacteristic(this.platform.Characteristic.Active)
      .onGet(this.handleGetActive.bind(this))
      .onSet(this.handleSetActive.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.CurrentHeaterCoolerState);
    //.onGet(this.handleGetCurrentState.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.TargetHeaterCoolerState)
      //.onGet(this.handleGetTargetState.bind(this))
      .onSet(this.handleSetTargetState.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.CurrentTemperature);
    //.onGet(this.handleGetCurrentTemp.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.SwingMode)
      //.onGet(this.handleGetSwingMode.bind(this))
      .onSet(this.handleSetSwingMode.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.RotationSpeed)
      //.onGet(this.handleGetRotationSpeed.bind(this))
      .onSet(this.handleSetRotationSpeed.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.CoolingThresholdTemperature)
      //.onGet(this.handleGetTargetTemp.bind(this))
      .onSet(this.handleSetTargetTemp.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.HeatingThresholdTemperature)
      //.onGet(this.handleGetTargetTemp.bind(this))
      .onSet(this.handleSetTargetTemp.bind(this));

    // additional handlers for the extra switches
    this.swClean.getCharacteristic(this.platform.Characteristic.On)
    // .onGet(this.handleGetSelfClean.bind(this))
      .onSet(this.handleSetSelfClean.bind(this));

    this.swDisplay.getCharacteristic(this.platform.Characteristic.On)
      //.onGet(this.handleGetDisplay.bind(this))
      .onSet(this.handleSetDisplay.bind(this));

    this.swAuto.getCharacteristic(this.platform.Characteristic.On)
      //.onGet(this.handleGetAuto.bind(this))
      .onSet(this.handleSetAuto.bind(this));
  }

  // update all characteristics
  public async updateAllNow(status: ElectroluxState): Promise<void> {

    this.service.getCharacteristic(this.platform.Characteristic.
      Active).updateValue(status.ac_pwr);

    this.service.getCharacteristic(this.platform.Characteristic.
      CurrentHeaterCoolerState).updateValue(this.fromACGetCurrentState(status));

    this.service.getCharacteristic(this.platform.Characteristic.
      TargetHeaterCoolerState).updateValue(this.fromACGetTargetState(status));

    this.service.getCharacteristic(this.platform.Characteristic.
      CurrentTemperature).updateValue(status.envtemp);

    this.service.getCharacteristic(this.platform.Characteristic.
      SwingMode).updateValue(status.ac_vdir);

    this.service.getCharacteristic(this.platform.Characteristic.
      RotationSpeed).updateValue(this.FromACMarkGetFanPercent(status.ac_mark));

    this.service.getCharacteristic(this.platform.Characteristic.
      CoolingThresholdTemperature).updateValue(status.temp);

    this.service.getCharacteristic(this.platform.Characteristic.
      HeatingThresholdTemperature).updateValue(status.temp);

    this.swClean.getCharacteristic(this.platform.Characteristic.
      On).updateValue(status.mldprf === 1? true : false);

    this.swDisplay.getCharacteristic(this.platform.Characteristic.
      On).updateValue(status.scrdisp);

    this.platform.log.debug('disp', status.scrdisp );

    this.swAuto.getCharacteristic(this.platform.Characteristic.
      On).updateValue(this.fromACisAutoMode(status));
  }



  private async setState(state: Partial<ElectroluxState>): Promise<ElectroluxState> {
    this.platform.log.debug('setState() called');
    return new Promise((resolve, reject) => {

      this.accessory.context.device.sendPacket(this.encode(state))
        .then((encryptedResponse) => {
          const decryptedResponse = this.accessory.context.device.decrypt(encryptedResponse);


          // set the time of the next check
          this.lastSuccessfulGet = Date.now();
          this.acStateCache = (this.decode(decryptedResponse));

          this.platform.log.debug('\n setState() called, updated cache and returning this JSON from AC:\n',
            JSON.stringify(this.acStateCache));

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
    this.platform.log.debug('checkLiveACState() called');
    const encryptedResponse = await this.accessory.context.device.sendPacket(this.encode({}));
    const decryptedResponse = await this.accessory.context.device.decrypt(encryptedResponse);
    const state = this.decode(decryptedResponse);
    this.lastSuccessfulGet = Date.now();
    this.acStateCache = state;
    this.platform.log.debug('\n checkLiveACState() called, updated cache with this JSON:\n',
      JSON.stringify(this.acStateCache));
    return state;
  }

  private async checkCacheACState(): Promise<ElectroluxState> {
    this.platform.log.debug('\n checkcacheACState() called, responding with this from cache:\n',
      JSON.stringify(this.acStateCache));
    return this.acStateCache;
  }



  // specific to 0x4f9b Electrolux/Kelvinator ACs
  protected encode(state: Partial<ElectroluxState>): Buffer {
    this.platform.log.debug('encode() called');
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

  protected decode(payload: Buffer): ElectroluxState {
    return this.getValue(
        JSON.parse(
          payload.subarray(0x0e).toString('ascii'),
        ) as ElectroluxState<number>,
        Boolean,
    ) as ElectroluxState;
  }

  protected getValue<I extends number | boolean, O extends number | boolean>(
    state: Partial<ElectroluxState<I>>,
    Number: (value: I) => O,
  ): Partial<ElectroluxState<O>> {
    return {

      // homekit uses 1 or 0 for these
      ac_pwr: state.ac_pwr,
      ac_vdir: state.ac_vdir,
      scrdisp: state.scrdisp !== undefined ? Number(state.scrdisp) : undefined,
      qtmode: state.qtmode,
      mldprf: state.mldprf,

      // bool for homekit
      ac_heaterstatus: state.ac_heaterstatus !== undefined ? Number(state.ac_heaterstatus) : undefined,
      ac_indoorfanstatus: state.ac_indoorfanstatus !== undefined ? Number(state.ac_indoorfanstatus) : undefined,
      ac_compressorstatus: state.ac_compressorstatus !== undefined ? Number(state.ac_compressorstatus) : undefined,

      // number ranges for these
      ac_mode: state.ac_mode,
      ac_mark: state.ac_mark,
      temp: state.temp,
      envtemp: state.envtemp,

      // string here
      modelnumber: state.modelnumber,
    };
  }

  protected fromACGetActive (status: ElectroluxState): number {
    let currentValue = 0;
    switch (status.ac_pwr) {
      case this.platform.Characteristic.Active.ACTIVE: {
        currentValue = this.platform.Characteristic.Active.ACTIVE;
        break;
      }
      case this.platform.Characteristic.Active.INACTIVE: {
        currentValue = this.platform.Characteristic.Active.INACTIVE;
        break;
      }
      default: {
        currentValue = this.platform.Characteristic.Active.INACTIVE;
        break;
      }
    }
    return currentValue;
  }

  protected fromACGetCurrentState(status: ElectroluxState): number {
    let currentValue = this.platform.Characteristic.CurrentHeaterCoolerState.INACTIVE;
    if (status.ac_indoorfanstatus && status.ac_compressorstatus) {
      currentValue = this.platform.Characteristic.CurrentHeaterCoolerState.COOLING;
    } else if (status.ac_indoorfanstatus && status.ac_heaterstatus) {
      currentValue = this.platform.Characteristic.CurrentHeaterCoolerState.HEATING;
    } else if (status.ac_indoorfanstatus && !status.ac_heaterstatus && !status.ac_compressorstatus) {
      currentValue = this.platform.Characteristic.CurrentHeaterCoolerState.IDLE;
    }
    return currentValue;
  }

  public fromACGetTargetState(status: ElectroluxState): number {
    let currentValue = this.platform.Characteristic.TargetHeaterCoolerState.AUTO;
    if (status.ac_mode === acMode.AUTO) {
      currentValue = this.platform.Characteristic.TargetHeaterCoolerState.AUTO;
    } else if (status.ac_mode === acMode.HEAT || status.ac_mode === acMode.HEAT_8) {
      currentValue = this.platform.Characteristic.TargetHeaterCoolerState.HEAT;
    } else if (status.ac_mode === acMode.COOL || status.ac_mode === acMode.DRY || status.ac_mode === acMode.FAN ) {
      currentValue = this.platform.Characteristic.TargetHeaterCoolerState.COOL;
    }
    return currentValue;
  }

  public fromHKTargetStateGetACMode(targetState: number): number {
    let targetACMode = this.platform.Characteristic.TargetHeaterCoolerState.AUTO;
    switch (targetState) {
      case this.platform.Characteristic.TargetHeaterCoolerState.AUTO: {
        targetACMode = acMode.AUTO;
        break;
      }
      case this.platform.Characteristic.TargetHeaterCoolerState.HEAT: {
        targetACMode = acMode.HEAT;
        break;
      }
      case this.platform.Characteristic.TargetHeaterCoolerState.COOL: {
        targetACMode = acMode.COOL;
        break;
      }
      default: {
        targetACMode = this.platform.Characteristic.TargetHeaterCoolerState.AUTO;
      }
    }
    return targetACMode;
  }

  public FromACMarkGetFanPercent(ac_mark: number): number {
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

  // from a homekit fan percentage, returns an electrolux fanspeed setting
  //     HK % - AC Setting   (ac_mark is the raw number)
  //    0-19% - Quiet        (ac_mark 5)
  //   20-39% - Low          (ac_mark 1)
  //   40-59% - Med          (ac_mark 2)
  //   60-79% - High         (ac_mark 3)
  //   80-99% - Turbo        (ac_mark 4)
  //     100% - Auto         (ac_mark 0)
  public fromFanPercentGetACMark(percent: number): number {
    let ac_mark = fanSpeed.AUTO; // default
    if (percent === 100) {
      // 100% Auto
      ac_mark = fanSpeed.AUTO;
    } else if (percent === 0 && percent <20) {
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
    } else if (percent >=80 && percent <100) {
      // turbo 80 - 99
      ac_mark = fanSpeed.TURBO;
    }
    return ac_mark;
  }

  public normTemp(temp: number): number {
    if (temp < 17) {
      temp = 17;
    } else if (temp > 30) {
      temp = 30 ;
    }
    return temp;
  }

  public fromACgetSwingMode(status: ElectroluxState): number{
    let currentValue = status.ac_vdir;
    switch (status.ac_vdir) {
      case this.platform.Characteristic.SwingMode.SWING_ENABLED: {
        currentValue = this.platform.Characteristic.SwingMode.SWING_ENABLED;
        break;
      }
      case this.platform.Characteristic.SwingMode.SWING_DISABLED: {
        currentValue = this.platform.Characteristic.SwingMode.SWING_DISABLED;
        break;
      }
    }
    return currentValue;
  }

  public fromACisAutoMode(status: ElectroluxState): boolean{
    if (status.ac_mode === acMode.AUTO
      && status.ac_mark === fanSpeed.AUTO
      && status.ac_pwr === 1) {
      return true;
    }
    return false;
  }

  public async handleGetActive(): Promise<CharacteristicValue> {
    const status = await this.getState();
    const currentValue = this.fromACGetActive(status);
    this.platform.log.debug('Getting Active status', currentValue, ' JSON : ', JSON.stringify(status));
    this.updateAllNow(status);
    return currentValue;
  }

  public async handleSetActive(value: CharacteristicValue): Promise<void> {
    const ac_pwr = value as number;
    this.platform.log.info(`'Setting AC Active : ${ac_pwr}'`);
    await this.setState({ ac_pwr });
  }

  public async handleSetTargetState(ac_TargetState: CharacteristicValue): Promise<void> {
    const ac_mode = this.fromHKTargetStateGetACMode(ac_TargetState as number);
    this.platform.log.info(`' Setting AC Mode : ${ac_mode}' (4 is auto)`);
    await this.setState({ ac_mode });
  }

  public async handleSetSwingMode(value: CharacteristicValue): Promise<void> {
    const ac_vdir = value as number;
    this.platform.log.info(`' Setting Fan Swing : ${ac_vdir}'`);
    await this.setState({ ac_vdir });
  }

  public async handleSetRotationSpeed(value: CharacteristicValue): Promise<void> {
    const ac_mark = this.fromFanPercentGetACMark(value as number);
    this.platform.log.info(`'Setting Fanspeed - Raw setting: ${ac_mark}, Fanspeed %: ${value}'`);
    await this.setState({ ac_mark });
  }

  public async handleSetTargetTemp(targetTemp: CharacteristicValue): Promise<void> {
    const temp = this.normTemp(targetTemp as number);
    this.platform.log.info(`'Setting Target Temp : asked for ${targetTemp}'`);
    await this.setState({ temp });
  }

  public async handleSetDisplay(value: CharacteristicValue): Promise<void> {
    let digit = 0;
    if (value) {
      digit = 1;
    }
    this.platform.log.info(' Setting display :', value, ' ', digit);
    await this.setState({ scrdisp: digit });
  }

  public async handleSetSelfClean(value: CharacteristicValue): Promise<void> {
    let digit = 0;
    const sw = value as boolean;
    if (sw) {
      digit = 1;
    }
    this.platform.log.info(' Setting Self Clean switch :', digit);
    await this.setState({ mldprf: digit });
  }

  // sets auto, and turning off powers off
  public async handleSetAuto(value: CharacteristicValue): Promise<void> {
    if (value) {
      // const response =
      await this.setState({ ac_pwr: 1, ac_mark: fanSpeed.AUTO, ac_mode: acMode.AUTO });
      // this.updateAll(response);
    } else if (!value) {
      // const response =
      await this.setState({ ac_pwr: 1 });
      // this.updateAll(response);
    }
    this.platform.log.info(' Setting Auto mode :', value);
  }

  // Get model in form of string
  public async getModel(): Promise<string> {
    const status = await this.getState();
    return status.modelnumber;
  }


}


