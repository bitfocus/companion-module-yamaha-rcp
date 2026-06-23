## Yamaha Remote Control Protocol - v3.6.1

Please visit https://discourse.checkcheckonetwo.com for help, discussions, suggestions, etc.

This module is not developed by Yamaha and as such Yamaha accepts no liability for the usage of this module. Yamaha also has no responsibility to support this module.

_Andrew Broughton, 2025_

---

**Instructions**

Note that this module only works to connected hardware. It does not work with the Editor.

**MACROS** ("Learn" Function)

> _Macro Preset is not available in this version, so please download the Macro Button page from https://discourse.checkcheckonetwo.com/t/macro-page-for-yamaha-rcp-and-midi-module_

> Macros utilize the new Action Recorder feature in v3, and will only work while connected to a console.

> Using one of the buttons you imported from the link above, press and hold the **REC Macro** button for 3 seconds to reset it. It will turn green and show **Ready to Record**. Press and hold it again to start recording. When it shows **REC Step: 0**, start doing stuff on the console. The Steps will increase as you add operations. Press it again to stop recording. All the actions you performed are now stored to that button. The button's name will change to **New Macro**. To reset the button and start again, simply press and hold the button for 3 seconds again until it turns green.

> Don't forget that you can create a macro by pressing a SD button (while recording) that already has actions on it while a console is connected.The new Macro will have those commands in it as well as any you added before you pressed the button or after!

**FADES**

> Recalling a scene from the console surface while Companion fades are running can cause unexpected fader movement, because the console recall and Companion fade updates may both write fader values at the same time.

> Scene recalls triggered from Companion actions or Companion scene recall presets are handled correctly and will cancel active fades before the recall is sent.

> Keep **Cancel fades on scene recall?** enabled unless you have a specific reason not to. The conservative defaults are 6 maximum concurrent fades, a 40 ms fade step interval, and an 80 ms metering interval for CL/QL consoles.

**VARIABLES**

> Select "Auto-Create Variable" to create a variable in the form **CommandName_Ch#** or **CommandName_Ch#\_Mix#**

> Use **@(internal:custom_MyCustomVar)** in the value field to update a custom variable within a feedback. Custom variable must already exist

**DYNAMIC CHANNEL PARAMETERS**

> If you add color feedback for a button, (e.g. InCh/Label/Color or DCA/Label/Color), the module will pull the color from the matching channel and change the button color accordingly.

> On larger systems, the Presets page can feel slow while it is open because Companion actively requests the dynamic information needed by the preset buttons currently displayed on screen, such as channel names, fader values, meters, cue state, and other feedback data.
