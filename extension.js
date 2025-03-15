// ES Module imports for GNOME 47
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as QuickSettings from 'resource:///org/gnome/shell/ui/quickSettings.js';

// Parameters
const EXTENSION_TITLE = 'Fan Profile';
const EXTENSION_ICON = 'weather-tornado-symbolic';
const EXTENSION_ICON_DIR = 'ico'

// Define the Quick Settings Indicator
const AsusFanSwitcherIndicator = GObject.registerClass(
class AsusFanSwitcherIndicator extends QuickSettings.SystemIndicator {
    _init(extensionObject) {
        super._init();
    }
});

// Define the Quick Settings toggle
const AsusFanSwitcherToggle = GObject.registerClass(
class AsusFanSwitcherToggle extends QuickSettings.QuickMenuToggle {
    _init(extensionObject) {
       
	// Store the extension object for later use
        this._extensionObject = extensionObject;

	super._init({
            title: _(EXTENSION_TITLE),
	    subtitle: _('Select Fan Profile'), // Initial subtitle
            iconName: EXTENSION_ICON,
        });

        // Add a header with icon and title
        this.menu.setHeader('compass-wind-symbolic.svg', _(EXTENSION_TITLE), _('Select Fan Profile'));
	
        // Add the menu items
	this._itemsSection = new PopupMenu.PopupMenuSection();
	this.menu.addMenuItem(this._itemsSection);
	// Load the available fan profiles dynamically
        this._loadFanProfiles();

	// Initialize the toggle state based on the current profile
        this._updateToggleState();

        // Connect to the Quick Settings menu's open-state-changed signal
        this._quickSettingsMenu = Main.panel.statusArea.quickSettings.menu;
        this._menuSignalId = this._quickSettingsMenu.connect(
            'open-state-changed',
            this._onMenuOpenStateChanged.bind(this)
        );

        // Connect to the toggle's click event
        this.connect('clicked', this._onToggleClicked.bind(this));
    }


    // Load available fan profiles dynamically
    _loadFanProfiles() {
        // Execute asusctl to list available profiles
        const command = ['asusctl', 'profile', '-l'];
        const proc = new Gio.Subprocess({
            argv: command,
            flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
        });

        // Initialize the subprocess
        proc.init(null);

        // Wait for the process to finish and capture the output
        proc.communicate_utf8_async(null, null, (proc, res) => {
            try {
                const [, stdout, stderr] = proc.communicate_utf8_finish(res);
                if (proc.get_exit_status() === 0) {
                    // Parse the output to extract profile names
                    const profiles = stdout.trim().split('\n').slice(1); // Skip the first line
                    profiles.forEach(profile => {
                        this._itemsSection.addAction(_(profile),
                            () => this._setFanProfile(profile));
                    });
                } else {
                    console.error(`Failed to list fan profiles: ${stderr.trim()}`);
                }
            } catch (e) {
                console.error(`Error executing asusctl: ${e.message}`);
            }
        });
    }	


    // Handle toggle clicks
    _onToggleClicked() {
        const currentProfile = this._getCurrentFanProfile();

        if (currentProfile === 'Quiet' || currentProfile === 'Performance') {
            // If the current profile is Quiet or Performance, switch to Balanced
            this._setFanProfile('Balanced');
        } else if (currentProfile === 'Balanced') {
            // If the current profile is Balanced, switch to Quiet
            this._setFanProfile('Quiet');
        }
    }

    // Helper function to execute asusctl command
    _setFanProfile(profile) {
	// Map the profile name to the corresponding asusctl argument
	const profileArg = profile.toLowerCase();
	
	// Spawn the asusctl command
	const command = ['asusctl', 'profile', '-P', profileArg];
	const proc = new Gio.Subprocess({
		argv: command,
		flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
	});

	// initialize the subprocess    
	proc.init(null);

	// Wait for the process to finish and log the output
	proc.communicate_utf8_async(null, null, (proc, res) => {
		try {
			const[, stdout, stderr] = proc.communicate_utf8_finish(res);
			if (proc.get_exit_status() === 0) {
				console.debug(`Fan profile set to ${profile}: ${stdout.trim()}`);
				// Update the toggle state and subtitle after setting the profile
				this._updateToggleState(profile);
			} else {
				console.error(`Failed to set fan profile: ${stderr.trim()}`);
			}
		} catch (e) {
			console.error(`Error executing asusctl: ${e.message}`);
		}
	});
    }

    // Helper function to update the toggle state and subtitle
    _updateToggleState(profile = null) {
        // If no profile is provided, fetch the current profile
        if (!profile) {
            profile = this._getCurrentFanProfile();
        }

        // Update the subtitle to show the current profile
        this.subtitle = profile;

        // Don't highlight the toggle if profile is 'Balanced'
        if (profile === 'Balanced') {
            this.checked = false; // Activate the toggle
        } else {
            this.checked = true; // Deactivate the toggle
        }
    }

    // Helper function to get the current fan profile
    _getCurrentFanProfile() {
        // Execute asusctl to get the current profile
        const command = ['asusctl', 'profile', '-p'];
        const proc = new Gio.Subprocess({
            argv: command,
            flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
        });

        // Initialize the subprocess
        proc.init(null);

        // Wait for the process to finish and capture the output
        try {
            const [, stdout] = proc.communicate_utf8(null, null);
            if (proc.get_exit_status() === 0) {
                // Extract the profile from the output (e.g., "Active Profile is: Balanced")
                const output = stdout.trim();
                const match = output.match(/Active profile is (\w+)/);
                if (match) {
                    return match[1]; // Return the profile name
                }
            }
        } catch (e) {
            console.error(`Error getting current fan profile: ${e.message}`);
        }
        return 'Unknown'; // Fallback if the profile cannot be determined
    }

    // Handle Quick Settings menu open/close events
    _onMenuOpenStateChanged(menu, isOpen) {
        if (isOpen) {
            // When the menu is opened, update the toggle state
            this._updateToggleState();
        }
    }

    // Clean up when the toggle is destroyed
    _onDestroy() {
        if (this._menuSignalId) {
            this._quickSettingsMenu.disconnect(this._menuSignalId);
            this._menuSignalId = null;
        }
    }

    // Add a destroy method to ensure cleanup
    destroy () {
        this._onDestroy();
	super.destroy();
    }

});


export default class AsusFanSwitcherExtension extends Extension {
    enable() {
	this._indicator = new AsusFanSwitcherIndicator(this);    
	this._toggle = new AsusFanSwitcherToggle(this);    
        this._indicator.quickSettingsItems.push(this._toggle);
	Main.panel.statusArea.quickSettings.addExternalIndicator(this._indicator);
    }

    disable() {
        if (this._toggle) {
            this._toggle.destroy();
            this._toggle = null;
        }
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
    }
}
