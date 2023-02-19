import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { ElectroluxBroadlinkACPlatform } from './platform';
// import Device from 'node-broadlink/dist/device';
import struct from 'node-broadlink/dist/struct';
// import { ServerResponse } from 'http';

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
export interface ElectroluxState<T = boolean> {

  // boolean
  ac_pwr: number;                    // Power
  scrdisp: number;                   // LED display
  qtmode: T;                    // beep on (tied to scrdisp)
  ac_vdir: number;                   // vswing
  mldprf: number;                    // self clean

  // variables
  ac_mark: number;              // Fan speed auto 0, low 1, med 2, high 3, turbo 4, quiet 5
  ac_mode: number;              // AC Mode cool 0, heat 1, dry 2, fan 3, auto 4, heat_8 6
  temp: number;                 // Target temp
  envtemp: number;              // Ambient temp

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


  constructor(
    private readonly platform: ElectroluxBroadlinkACPlatform,
    private readonly accessory: PlatformAccessory,
  ) {



    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, accessory.context.manufacturer as string)
      .setCharacteristic(this.platform.Characteristic.Model, accessory.context.model as string)
      .setCharacteristic(this.platform.Characteristic.SerialNumber, accessory.context.serial as string);



    // get the  service if it exists, otherwise create a new  service
    // you can create multiple services for each accessory
    this.service = this.accessory.getService(this.platform.Service.HeaterCooler) ||
    this.accessory.addService(this.platform.Service.HeaterCooler);

    // add additional switches for clean/display/auto
    this.swClean = this.accessory.getService('Self Clean') ||
    this.accessory.addService(this.platform.Service.Switch, 'Self Clean', 'selfClean');

    this.swDisplay = this.accessory.getService('LED Display') ||
    this.accessory.addService(this.platform.Service.Switch, 'LED Display', 'display');

    this.swAuto = this.accessory.getService('AUTO') ||
    this.accessory.addService(this.platform.Service.Switch, 'AUTO', 'auto');

    // default name on the Home app
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.name);


    this.service.getCharacteristic(this.platform.Characteristic.CoolingThresholdTemperature).props.minValue = 17;
    this.service.getCharacteristic(this.platform.Characteristic.CoolingThresholdTemperature).props.maxValue = 30;
    this.service.getCharacteristic(this.platform.Characteristic.HeatingThresholdTemperature).props.minValue = 17;
    this.service.getCharacteristic(this.platform.Characteristic.HeatingThresholdTemperature).props.maxValue = 30;

    this.service.getCharacteristic(this.platform.Characteristic.CoolingThresholdTemperature).props.minStep = 1;
    this.service.getCharacteristic(this.platform.Characteristic.HeatingThresholdTemperature).props.minStep = 1;



    // each service must implement at-minimum the "required characteristics" for the given service type
    // see https://developers.homebridge.io/#/service/Lightbulb


    // create handlers for required characteristics
    this.service.getCharacteristic(this.platform.Characteristic.Active)
      .onGet(this.handleGetActive.bind(this))
      .onSet(this.handleSetActive.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.CurrentHeaterCoolerState)
      .onGet(this.handleGetCurrentState.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.TargetHeaterCoolerState)
      .onGet(this.handleGetTargetState.bind(this))
      .onSet(this.handleSetTargetState.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
      .onGet(this.handleGetCurrentTemp.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.SwingMode)
      .onGet(this.handleGetSwingMode.bind(this))
      .onSet(this.handleSetSwingMode.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.RotationSpeed)
      .onGet(this.handleGetRotationSpeed.bind(this))
      .onSet(this.handleSetRotationSpeed.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.CoolingThresholdTemperature)
      .onGet(this.handleGetTargetTemp.bind(this))
      .onSet(this.handleSetTargetTemp.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.HeatingThresholdTemperature)
      .onGet(this.handleGetTargetTemp.bind(this))
      .onSet(this.handleSetTargetTemp.bind(this));

    this.swClean.getCharacteristic(this.platform.Characteristic.On)
      .onGet(this.handleGetSelfClean.bind(this))
      .onSet(this.handleSetSelfClean.bind(this));

    this.swDisplay.getCharacteristic(this.platform.Characteristic.On)
      .onGet(this.handleGetDisplay.bind(this))
      .onSet(this.handleSetDisplay.bind(this));

    this.swAuto.getCharacteristic(this.platform.Characteristic.On)
      .onGet(this.handleGetAuto.bind(this))
      .onSet(this.handleSetAuto.bind(this));

  }


  public async updateAll(status: ElectroluxState): Promise<void> {
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

    this.swAuto.getCharacteristic(this.platform.Characteristic.
      On).updateValue(this.fromACisAutoMode(status));

    this.swDisplay.getCharacteristic(this.platform.Characteristic.
      On).updateValue(status.scrdisp);

    this.swClean.getCharacteristic(this.platform.Characteristic.
      On).updateValue(status.mldprf);

  }



  public setState(state: Partial<ElectroluxState>): Promise<ElectroluxState> {
    return new Promise((resolve, reject) => {
      this.accessory.context.device.sendPacket(this.encode(state))
        .then((response) => {
          const decryptedResponse = this.accessory.context.device.decrypt(response);
          this.platform.log.debug('\n setState() request packet  hex :', this.encode(state).toString('hex'));
          this.platform.log.debug('\n setState() request packet  hex :', this.encode(state).toString('hex'));
          this.platform.log.debug('\n setState() request packet  asc :', this.encode(state).toString('ascii'));

          this.platform.log.debug('\n setState() response packet  hex :', decryptedResponse.toString('hex'));
          this.platform.log.debug('\n setState() response packet  asc :', decryptedResponse.toString('ascii'));

          resolve(this.decode(decryptedResponse));
        })
        .catch((err) => {

          this.platform.log.debug('\n setState() send packet  hex :', this.encode(state).toString('hex'));
          this.platform.log.debug('\n setState() send packet  asc :', this.encode(state).toString('ascii'));

          reject(err);
        });
    });
  }


  // this returns the state in the the form of an object
  public getState(): Promise<ElectroluxState> {
    return new Promise((resolve, reject) => {
      this.accessory.context.device.sendPacket(this.encode({}))
        .then((response) => {
          const decryptedResponse = this.accessory.context.device.decrypt(response);
          this.platform.log.debug('\n getState() request packet  hex :', this.encode({}).toString('hex'));
          this.platform.log.debug('\n getState() request packet  asc :', this.encode({}).toString('ascii'));
          this.platform.log.debug('\n getState() response packet  hex :', decryptedResponse.toString('hex'));
          this.platform.log.debug('\n getState() response packet  asc :', decryptedResponse.toString('ascii'));

          resolve(this.decode(decryptedResponse));
        })
        .catch((err) => {

          this.platform.log.debug('\n getState() request packet  hex :', this.encode({}).toString('hex'));
          this.platform.log.debug('\n getState() request packet  asc :', this.encode({}).toString('ascii'));

          reject(err);
        });
    });
  }


  // device specific packet format
  // this is a payload for a larger packet, more or less
  // wrapped up inside the packet generated by sendPacket in the
  // broadlink Device Class
  protected encode(state: Partial<ElectroluxState>): Buffer {

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

    this.platform.log.debug('\n encode packet  hex :', packet.toString('hex'));
    this.platform.log.debug('\n encode packet  asc :', packet.toString('ascii'));
    this.platform.log.debug('\n encode packet  asc2:', packet.subarray(0x0e, 0x0e + struct('h')
      .unpack_from(packet, 0x0a)[0]).toString('ascii'));

    return packet;
  }

  protected decode(payload: Buffer): ElectroluxState {
    this.platform.log.debug('\n decode packet  hex :', payload.toString('hex'));
    this.platform.log.debug('\n decode packet ascii:', payload.toString('ascii'));
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
      ac_pwr: state.ac_pwr,
      scrdisp: state.scrdisp,
      qtmode: state.qtmode !== undefined ? Number(state.qtmode) : undefined,
      ac_vdir: state.ac_vdir,
      mldprf: state.mldprf,

      ac_heaterstatus: state.ac_heaterstatus !== undefined ? Number(state.ac_heaterstatus) : undefined,
      ac_indoorfanstatus: state.ac_indoorfanstatus !== undefined ? Number(state.ac_indoorfanstatus) : undefined,
      ac_compressorstatus: state.ac_compressorstatus !== undefined ? Number(state.ac_compressorstatus) : undefined,


      ac_mode: state.ac_mode,
      ac_mark: state.ac_mark,
      temp: state.temp,
      envtemp: state.envtemp,

      modelnumber: state.modelnumber,
    };
  }



  // from electrolux power status gets ac active status in homekit codes
  // prob redundant, coz both are 0=off, 1=on
  public fromACGetActive (status: ElectroluxState): number {
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

  // translates from the electrolux status to homekit status
  //    looks at fan and compressor statuses etc, hence the if statements
  public fromACGetCurrentState(status: ElectroluxState): number {
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

  // translates from the electrolux mode numbers (0-6) to homekit modes (0-2)
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

  //translates between homekit numbers (0-2) and electrolux numbers (0-6)
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

  // translates from the 6 fan speeds to a percentage for homekit
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
    } else if (percent <=20 && percent <40 ) {
      // low 20 - 39
      ac_mark = fanSpeed.LOW;
    } else if (percent <=40 && percent <60) {
      // med 40 - 59
      ac_mark = fanSpeed.MED;
    } else if (percent <=60 && percent <80) {
      // high 60 - 79
      ac_mark = fanSpeed.HIGH;
    } else if (percent <=80 && percent <100) {
      // turbo 80 - 99
      ac_mark = fanSpeed.TURBO;
    }
    return ac_mark;
  }

  // looks at the ac status object (ElectroluxState)
  // grabs the current value in a number
  // value ac_vdir: 0 = off , 1 = on
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

  // looks at the ac status object (ElectroluxState)
  // if ac is on, in auto mode, and fan auto,
  // returns true
  public fromACisAutoMode(status: ElectroluxState): boolean{
    this.platform.log.debug(`' checking Auto status : 
    AC On: ${status.ac_pwr}, 
    AC Mode: ${status.ac_mode}, 
    AC Fanspeed: ${status.ac_mark}`);
    if (status.ac_mode === acMode.AUTO
      && status.ac_mark === fanSpeed.AUTO
      && status.ac_pwr === 1) {
      this.platform.log.debug('Is in Auto: ..', true);
      return true;

    }
    this.platform.log.debug('Is in Auto: ..', false);
    return false;
  }


  public async handleGetActive(): Promise<CharacteristicValue> {
    const status = await this.getState();
    const currentValue = this.fromACGetActive(status);
    this.platform.log.debug(`'Checking AC Active : ${status.ac_pwr}\n'`);
    return currentValue;
  }

  public async handleSetActive(value: CharacteristicValue): Promise<void> {
    const ac_pwr = value as number;
    // return this.setState({ ac_pwr }).then();
    this.platform.log.info(`'Setting AC Active : ${value}\n'`);
    const response = await this.setState({ ac_pwr });
    this.updateAll(response);
  }

  // current heater / cooler state, looking at compressor/fan status
  public async handleGetCurrentState(): Promise<CharacteristicValue> {
    const status = await this.getState();
    const currentState = this.fromACGetCurrentState(status);

    this.platform.log.debug(`'Checking AC Operational state :\n
    Fan Status On : ${status.ac_indoorfanstatus}\n
    Heater Status On : ${status.ac_heaterstatus}\n
    AC Compressor Status On : ${status.ac_compressorstatus}\n
    Returning Homekit Status : ${currentState} ( 0 = Inactive, 1 = Idle, 2 = Heating 3 = Cooling )\n'`);

    return currentState;
  }

  // maps the 6 AC modes to the 3 supported by Homekit
  public async handleGetTargetState(): Promise<CharacteristicValue> {
    const status = await this.getState();
    const targetState = this.fromACGetTargetState(status);

    this.platform.log.debug(`'Checking AC Current Mode :\n
    Homekit ID: ${targetState} ( 0 = Auto, 1 = Heat, 2 = Cool )\n
    Electrolux ID: ${status.ac_mode} ( 0 = Cool , Heat, Dry, Fan, 4 = Auto, 6 = Heat_8 )'`);

    return targetState;
  }

  // maps the 3 AC target states to auto/heat/cool on the Electrolux
  public async handleSetTargetState(ac_TargetState: CharacteristicValue): Promise<void> {
    const ac_mode = this.fromHKTargetStateGetACMode(ac_TargetState as number);
    // if (ac_modeSet === 0)
    // return this.setState({ ac_mode }).then();
    this.platform.log.debug(`'Setting AC Mode AUTO :\n
    Homekit ID: ${ac_TargetState} ( 0 = Auto, 1 = Heat, 2 = Cool )\n
    Electrolux ID: ${ac_mode} ( 0 = Cool , Heat, Dry, Fan, 4 = Auto, 6 = Heat_8 )'`);
    const response = await this.setState({ ac_mode });
    this.updateAll(response);
  }



  public async handleGetCurrentTemp(): Promise<CharacteristicValue> {
    const status = await this.getState();
    this.platform.log.debug(`' Checking ambient temp : ${status.envtemp}'`);
    return status.envtemp;
  }

  public async handleSetSwingMode(value: CharacteristicValue): Promise<void> {
    const ac_vdir = value as number;
    this.platform.log.debug(`' Setting Fan Swing : ${ac_vdir}'`);
    const response = await this.setState({ ac_vdir });
    this.updateAll(response);
  }

  public async handleGetSwingMode(): Promise<CharacteristicValue> {
    const status = await this.getState();
    const currentValue = this.fromACgetSwingMode(status);
    return currentValue;
  }



  public async handleGetRotationSpeed(): Promise<CharacteristicValue> {
    const status = await this.getState();
    const fanPercent = this.FromACMarkGetFanPercent(status.ac_mark);
    this.platform.log.debug(`' Checking Fanspeed -- ac_mark: ${status.ac_mark}, Fanspeed %: ${fanPercent}'`);
    return fanPercent;
  }

  public async handleSetRotationSpeed(value: CharacteristicValue): Promise<void> {
    const ac_mark = this.fromFanPercentGetACMark(value as number);
    this.platform.log.debug(`' setting Fanspeed -- ac_mark: ${ac_mark}, Fanspeed %: ${value}'`);
    const response = await this.setState({ ac_mark });
    this.updateAll(response);
  }

  // from the switch type in node-broadlink, seems to be json !
  public async handleSetTargetTemp(targetTemp: CharacteristicValue): Promise<void> {
    let temp = targetTemp as number;
    if (temp <= 17) {
      temp = 17;
    }
    if (temp >= 30) {
      temp = 30;
    }
    // return this.setState({ temp }).then();
    this.platform.log.debug(`'Setting Target Temp : asked for ${targetTemp} -> setting ${temp}'`);
    const response = await this.setState({ temp });
    this.updateAll(response);
  }

  public async handleGetTargetTemp(): Promise<CharacteristicValue> {
    const status = await this.getState();
    this.platform.log.debug(`' Checking ambient temp : ${status.temp}'`);
    return status.temp;
  }




  public async handleSetDisplay(value: CharacteristicValue): Promise<void> {
    const scrdisp = value as number;
    this.platform.log.debug(' Setting display :', scrdisp);
    const response = await this.setState({ scrdisp });
    this.updateAll(response);
  }

  public async handleGetDisplay(): Promise<CharacteristicValue> {
    const status = await this.getState();
    this.platform.log.debug(' Checking display :', status.scrdisp);
    return status.scrdisp;
  }



  // from the switch type in node-broadlink, seems to be json !

  public async handleSetSelfClean(value: CharacteristicValue): Promise<void> {
    const mldprf = value as number;
    this.platform.log.debug(' Setting Self Clean switch :', value);
    const response = await this.setState({ mldprf });
    this.updateAll(response);
  }

  public async handleGetSelfClean(): Promise<CharacteristicValue> {
    const status = await this.getState();
    this.platform.log.debug(' Checking selfclean switch :', status.mldprf);
    return status.mldprf;
  }



  // sets auto, and turning off powers off

  public async handleSetAuto(value: CharacteristicValue): Promise<void> {
    this.platform.log.debug(' Setting Auto switch :', value);
    const desiredAuto = value as number;
    if (desiredAuto === 1) {
      const response = await this.setState({ ac_pwr: 1, ac_mark: fanSpeed.AUTO, ac_mode: acMode.AUTO });
      this.updateAll(response);
    } else if (desiredAuto === 0) {
      const response = await this.setState({ ac_pwr: 1 });
      this.updateAll(response);
    }
  }



  public async handleGetAuto(): Promise<CharacteristicValue> {
    const status = await this.getState();
    if (this.fromACisAutoMode(status)) {
      return 1;
    } else {
      return 0;
    }
  }

  // not used. ideally get model and push it into the accessory data
  public async getModel(): Promise<string> {
    const status = await this.getState();
    return status.modelnumber as string;
  }

}





