## Yamaha Remote Control Protocol v1.7.2

**Available for the following Yamaha Pro Audio Devices**

* Rivage PM
* CL1/3/5
* QL1/5
* TF1/3/5
* TF-Rack

**Available commands**

* Selected "set" commands
* Recall Scenes

Please visit http://discourse.checkcheckonetwo.com for help, discussions, suggestions, etc.

*Andrew Broughton*

---

**REVISION HISTORY**

v1.7.2  Bug fix - custom variables on dropdown working again

v1.7.1  Bug fixes for custom variable handling & add ability to set variable for Scene #

v1.7.0  Add the ability to set custom variables via Feedback

v1.6.7  No more need for "My Channel" now that there's custom variables!

v1.6.6  Support for Variables (values only so far)

v1.6.5  Yet another Bug fix for Scene Recall on Rivage

v1.6.4  Bug fix for Scene Recall on Rivage (different issue)

v1.6.3  Bug fix for Scene Recall

v1.6.2  Initial support for Relative values

v1.6.1  Additional Rivage Commands

v1.6.0  Rename module, Change action names to be consistent across consoles
 
v1.5.1  Added Toggle function and updated feedback to new format

v1.5.0  New Features

        Added support for PM Rivage Series mixers
        Changed Macro function to work the same as Yamaha-MIDI module

v1.4.1  Added "Div" commands

v1.4.0  Additional dropdowns for patch & Icons, Rebuild of feedback code (thank you Keith!)

v1.3.6  Additional "My Channels"

v1.3.5  Bug Fixes

        Changed erroneous TF parameters in an effort to make the Dynamic Parameters work for the TF
        Parsing improved on commands from console
        Don't send commands for disabled instances
        Color & scene message fixes for TF
        Custom layer fix for QL
        Default value for checkbox parsing fix
        Enabled search for dropdowns

v1.3.3  Dynamic Parameters

        Added the ability for buttons to have channel names and colors automatically pulled from the console
        if desired.

v1.3.2  Bug Fixes

        Macros with negative values not played back correctly
        Multiple Record Macro Buttons would appear in certain situations

v1.3.1  Enhancement

        Macros! Add a Macro Button to record operations from the console or button presses on the SD

v1.2.3  Enhancement

        Added "My Channel" to the config page to allow default channel selection without re-creating buttons

v1.2.2  Bug Fixes

        Changed feedback to work more like other modules
        Fixed Action names

v1.2.1  Re-Write

        Re-Written in ES6 style (no self, use classes and inline functions)
        Separated upgradeScripts to separate file
        Fixed global variables
        More accurate feedback tracking

v1.1.4  Enhancements

        Polling for Feedback
        More TF5 commands

v1.1.3  Bug Fixes and Enhancements

        Fix:            Values for certain parameters off by 1
                        Feedback could get out of sync
                        Code fixups
        Enhancements:   Sorted actions so they're grouped together

v1.1.2  Bug Fix

        Fix:            Crash on unknown command in QL
        Enhancement:    Add QL-specific commands

v1.1.1  Bug Fixes
        
        Fix:            Custom Fader Bank values corrected
        Enhancement:    Custom Fader Bank dropdown for channel names
        Enhancement:    Dropdown for channel colors

v1.1.0  Initial Commit

        To Do:          QL/TF testing