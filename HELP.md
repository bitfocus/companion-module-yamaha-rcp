## Yamaha Remote Control Protocol - v1.7.1

Please visit http://discourse.checkcheckonetwo.com for help, discussions, suggestions, etc.

*Andrew Broughton*

---

**Instructions**

**MACROS** ("Learn" Function)

>This will only work while connected to a console.

>Drag the "Record RCP Macro" Preset to your page, press it to start recording, do stuff, then press it again to stop recording. All the actions you performed are now stored to that button. The button's name will change to **Macro x** (where x is the macro #)

>Don't forget that you can create a macro by pressing a SD button (while recording) that already has actions on it while a console is connected.The new Macro will have those commands in it as well as any you added before you pressed the button or after!

**DYNAMIC CHANNEL PARAMETERS**

>If you add color feedback for a button, (e.g. InCh/Label/Color or DCA/Label/Color), the module will pull the color from the matching channel and change the button text or color accordingly.

**SET CUSTOM VARIABLES FROM FEEDBACK**
>In feedback, put a variable in for a value with the "@" sign instead of the "$" sign to set that variable to the current value. e.g. use @(internal:custom_MyLevel1) in the value field for InCh/Fader/Level Ch1 and the custom variable MyLevel1 will have the current value of Ch 1's fader.