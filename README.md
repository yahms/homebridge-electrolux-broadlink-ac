
# homebridge-electrolux-broadlink-ac

Homebridge plugin for Electrolux (Kelvinator) Airconditioner models that use a Broadlink Module from the factory to provide WiFi or remote control via an app - Home Comfort

So far this is tested with the following:

* Kelvinator KSD50HWJ - Works

With Version 1.2, probably a good idea to remove the cached accessory, since the previos version created a different accessory type and im not sure how that will behave.

### Details

These ACs have a Broadlink Device type of 0x4f9b, and report their name as 'ELECTROLUX_OEM'.

As well as a different device type/ID, these also seem to have a different behaviour and packet strucutre to other Broadlink based ACs.

## Installation

1. This assumes you have Homebridge installed and running. 

2. Use the Home Comfort App to join your AC to your Wifi network.

3. If this plugin detects the AC but doesnt work, do the AC wifi setup again (hold down LED on the remote), but to *exit the App* when it asks you to name the aircon unit.

4. AC should show the Wifi symbol as solid. Ideally do a Lan Scan to make sure it has an IP. Mac address vendor will likely be "Hangzhou BroadLink Technology Co.,Ltd"

5. From the Homebridge Web GUI, search for this plugin ie 'Electrolux'.

This plugin should support multiple ACs on the same setwork because it will automatically discover and add them using the Broadlink Protocol Discovery, though I havent tested multiple units in the real world.

Technically its possible to make this (or other Broadlink based AC plugins) work for many units, but i did this one specific to these models and devices that have a Broadlink ID other than 0x4f9b will be ignored.


## Usage


This plugin creates 2 Devices for the AC unit. (this is because HomeKit doesnt have an accessory that aligns to these units perfectly)


### Thermostat Accessory
This represents the Compressor and active heating and cooling functions, as well as temperature adjustment and reporting. When this is on, it means the AC is actively cooling or heating.


[Mode controls]

* `AUTO` will set Auto mode on the AC
* `COOL` will set Cooling only mode on the AC
* `HEAT` will set Heating only mode on the AC
* `OFF` will power off the AC


[Temperature control]
Unlike the 'Heater Cooler' accessory, this no longer requires a heating and cooling threshold temp. It's a single target temp.


### Fan Accessory
This represents the Fan as a separate device. When this is on, the fan is running.



[Speed controls]

The AC has 5 fan speeds and map to Home % speeds this way:

| Fanspeed | AC equivalent |
|--------- | --------------|
| 0        | off           |
| 1 - 19   | quiet         |
| 20 - 39  | low           |
| 40 - 59  | medium        |
| 60 - 79  | high          |
| 80 - 100 | turbo         |



[Fan Mode i.e. Fan Speed Mode]
Not to be confused with the AC being in Fan-Only mode, this switch selects Auto mode for the fan i.e. Fan Speed = Auto


[Oscillate]
Fan swing / Oscillate

### Switch Accessories


Following switches can be exposed via Config.json (some are on by default):

| Switch name | Description                                                                                            |
|-------------|--------------------------------------------------------------------------------------------------------|
| Auto        | AC Auto mode                                                                                           |
| Quiet Auto  | AC Auto mode, but fan in Quiet mode                                                                    |
| Fan Mode    | AC Fan mode                                                                                            |
| Dry Mode    | AC Dry mode                                                                                            |
| LED Display | to enable and disable the LED display, and Beep, which are not able to be separately controlled        |
| De-Beep     | Attempts to disable beep every time the AC switches on, though the act of turning on the AC will beep. |
| Fan Swing   | Enables Fan Swing/Oscillate                                                                            |
| Self Clean  | Enables self clean                                                                                     |


### Behavior


Switching on via the main Thermostat Accessory will enable Auto mode, likewise switching off from the icon powers off the entire AC.

Switching on via the Fan accessory will power on and/or switch the AC to Fan Only mode


[Display]
The icon should report correct figures for target and ambient temperature.


The icon will also display current status of the unit and its current activity, with the following behavior:
* `Auto, Heat, Cool modes` icon lit, temp number changing depending on AC activity (black/blue/red)
* `Fan or Dry modes` the AC icon will not be lit. (even though technically in Dry mode its active)
* `Off` icon not lit

[Names in Home]
Ive tried to make the names work ok. IOS16 can be funny.

When you first configure the device, you can set a name for the entire accessory, after that, you will then see all the accessories underneath that, which have their own name.

[Logging in homebridge]
you'll see these messages:
```This plugin generated a warning from the characteristic 'Configured Name': Characteristic not in required or optional characteristic section for service Switch. Adding anyway.```

Safe to ignore, it only happens when configuring for the first time, because the plugin records accessory names in a way that is more iOS 16 friendly. Credit to homebridge devs for futureproofing in this way.

### AC unit traits


* In heat mode, once the target temp has been reached, the unit will power off the Fan also. The Fan Accessory should also show inactivity. Also in heat, it may take a moment for the fan to start. The Home app will reflect this b
* When turning on the unit, the LED Display and Beeping turns back on. This is not the plugin, hence the De-Beep button.
* When turning off the unit, the compressor can stay technically active for several minutes. if you power off and you see the tile lit, this is likely because the AC is reporting it is active. give it 5-10min.
* When turning off the unit, the compressor can stay technically active for several minutes. if you power off and you see the tile lit, this is likely because the AC is reporting it is active. give it 5-10min.


### Issues

I not an experienced coder but if it doesnt work with your Electrolux or Kelvinator AC feel free to log an issue and I'll see what I can do. I cant guarantee I'll get to it fast let alone solve it. Thanks for your patience!



### Things not implemented

No timer, sleep, 

### Optional buttons. you can add other buttons via the config.json (use Config UI-X)


## Other

* you can Apply your own names to an AC unit by specifying its Mac Address

* you can also specify other Broadlink device types forcefully, incase you want to fork this I guess?

### To do

make it work better?


### Credits

* On the homeassistant.io boards, DotEfEkts' awesome Python extension to python-broadlink for Electrolux Devices

* Nigel Farina and all the devs of [`Homebridge`](homebridge.io)

All the Devs of these plugins:

* [`python-broadlink`](https://github.com/mjg59/python-broadlink]) Used with the electrolux.py to look at the json and see what was possible.

* [`broadlink-dissector`](https://github.com/csabavirag/broadlink-dissector) Used this to look at the packets on the network and check I had my packet-building code right

* [`homebridge-broadlink-heater-cooler`](https://github.com/makleso6/homebridge-broadlink-heater-cooler) Borrowed some structure and code ideas

* [`node-broadlink`](https://github.com/ThomasTavernier/node-broadlink) Library used for the base Broadlink protocol

