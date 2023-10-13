## Yamaha Remote Control Protocol - v3.3.1

Please visit https://discourse.checkcheckonetwo.com for help, discussions, suggestions, etc.

_Andrew Broughton_

---

**Instructions**

**MACROS** ("Learn" Function)

> *Macro Preset is not available in this version, so please download the Macro Button page from https://discourse.checkcheckonetwo.com/t/macro-page-for-yamaha-midi-module/2267*

> Macros utilize the new Action Recorder feature in v3, and will only work while connected to a console.

> Using one of the buttons you imported from the link above, press and hold the **REC Macro** button for 3 seconds to reset it. It will turn green and show **Ready to Record**. Press and hold it again to start recording. When it shows **REC Step: 0**, start doing stuff on the console. The Steps will increase as you add operations. Press it again to stop recording. All the actions you performed are now stored to that button. The button's name will change to **New Macro**. To reset the button and start again, simply press and hold the button for 3 seconds again until it turns green.

> Don't forget that you can create a macro by pressing a SD button (while recording) that already has actions on it while a console is connected.The new Macro will have those commands in it as well as any you added before you pressed the button or after!

**VARIABLES**
> Select "Auto-Create Variable" to create a variable in the form **CommandName_Ch#** or **CommandName_Ch#_Mix#**

> Use **@(internal:custom_MyCustomVar)** in the value field to update a custom variable within a feedback. Custom variable must already exist

**DYNAMIC CHANNEL PARAMETERS**

> If you add color feedback for a button, (e.g. InCh/Label/Color or DCA/Label/Color), the module will pull the color from the matching channel and change the button color accordingly.
