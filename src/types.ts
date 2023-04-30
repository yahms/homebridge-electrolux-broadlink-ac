import { PlatformIdentifier, PlatformName } from 'homebridge';

export type ElectroluxBroadlinkPlatformConfig = {
  platform: PlatformName | PlatformIdentifier;
  name?: string;
  minRequestFrequency?: number;
  updateInterval?: number;
  auto?: boolean;
  selfClean?: boolean;
  display?: boolean;
  quietAuto?: boolean;
  deBeep?: boolean;
  fanMode?: boolean;
  dryMode?: boolean;
  fanQuiet?: boolean;
  fanSwing?: boolean;
  namedDevices?: Array<namedDevice>;
  allowedDevices?: string[];
};

export type namedDevice = {
  name?: string;
  macAddress?: string;
  model?: string;
  manufacturer?: string;
};

