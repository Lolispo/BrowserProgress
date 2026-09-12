// Author Petter Andersson
"use strict"

// Keyboard controls + a dev-only speed toggle.
//
// Hotkeys are data: each ACTION / SCOUT gets a key, shown as a badge on its bar
// (see bars.js). Pressing the key triggers that bar exactly as a click would, so
// all the usual gating (visible, clickable, requirements) is reused via the
// existing click handler.

var ACTION_KEYS = {
	chopWood: "1", mineIron: "2", hunt: "3", clawTree: "4",
	trainSpeed: "5", trainStrength: "6", trainCardio: "7", mineCrystal: "8",
	sleep: "9",
};
var SCOUT_KEYS = { hills: "q", mountains: "w", cavern: "e" };
var DEV_SPEED_KEY = "`"; // backtick cycles the dev fast-forward
// Multipliers the dev key cycles through. The fast end exists to reach late game
// in a sitting: the Monument wants 1200 wood and four claimed regions.
var DEV_SPEEDS = [1, 5, 25, 100];
var RENDERER_KEY = "g"; // G flips between the 2D and 3D village
// Home / Backspace frames the whole valley again — the RTS convention for
// "centre the view", and the way back when you have zoomed into a corner.
var RESET_VIEW_KEYS = ["home", "backspace"];

// Attach `key` onto the registry entries. Must run before initBars/initScouts so
// the bars render their key badges.
function assignHotkeys(){
	var id;
	for(id in ACTION_KEYS){ if(ACTIONS[id]){ ACTIONS[id].key = ACTION_KEYS[id]; } }
	for(id in SCOUT_KEYS){ if(SCOUTS[id]){ SCOUTS[id].key = SCOUT_KEYS[id]; } }
}

// Bind the keydown handler + build the help overlay. Run after bars/scouts exist.
function initHotkeys(){
	var map = {}; // key -> bar container id
	var shopMap = {}; // key -> shop item (buy on press)
	var id;
	for(id in ACTIONS){ if(ACTIONS[id].key){ map[ACTIONS[id].key] = ACTIONS[id].barId; } }
	for(id in SCOUTS){ if(SCOUTS[id].key){ map[SCOUTS[id].key] = SCOUTS[id].barId; } }
	for(id in SHOP_ITEMS){ if(SHOP_ITEMS[id].key){ shopMap[SHOP_ITEMS[id].key] = SHOP_ITEMS[id]; } }

	buildHotkeyHelp();

	$(document).on("keydown", function(e){
		if(e.ctrlKey || e.metaKey || e.altKey){ return; }
		var k = e.key.toLowerCase();
		if(k === "h" || k === "?"){ e.preventDefault(); toggleHotkeyHelp(); return; } // H works on all layouts
		if(developer && e.key === DEV_SPEED_KEY){ e.preventDefault(); toggleDevSpeed(); return; }
		if(k === RENDERER_KEY){ e.preventDefault(); toggleRenderer(); return; }
		if(RESET_VIEW_KEYS.indexOf(k) >= 0){
			e.preventDefault();
			if(Renderer && Renderer.resetView){ Renderer.resetView(scene); }
			return;
		}
		var barId = map[k];
		if(barId && !$("#" + barId).hasClass("hidden")){
			e.preventDefault();
			$("#" + barId + "_outerdiv").trigger("click"); // reuse the click gating
			return;
		}
		if(shopMap[k]){ e.preventDefault(); buyItem(shopMap[k]); } // buy from anywhere
	});
}

function buildHotkeyHelp(){
	var rows = "";
	var id;
	for(id in ACTIONS){
		if(ACTIONS[id].key){ rows += "<div><b>" + ACTIONS[id].key.toUpperCase() + "</b> " + ACTIONS[id].label + "</div>"; }
	}
	for(id in SCOUTS){
		if(SCOUTS[id].key){ rows += "<div><b>" + SCOUTS[id].key.toUpperCase() + "</b> " + SCOUTS[id].label + "</div>"; }
	}
	for(id in SHOP_ITEMS){
		if(SHOP_ITEMS[id].key){ rows += "<div><b>" + SHOP_ITEMS[id].key.toUpperCase() + "</b> Buy " + SHOP_ITEMS[id].name + "</div>"; }
	}
	rows += "<div><b>G</b> Switch graphics (2D / 3D)</div>";
	rows += "<div><b>Home</b> Frame the whole valley (3D: also stops following)</div>";
	rows += "<div><b>H</b> Toggle this help</div>";
	rows += "<div style='margin-top:8px'>In 3D: wheel zooms (and tilts), drag to spin, " +
		"push the pointer against the left or right edge to scroll sideways, " +
		"double-click to follow the villagers again.</div>";
	rows += "<div style='margin-top:8px'>Right-click an action bar to walk it back one step: auto-repeat off, " +
		"then drop a queued order (its orange badge does this too), then call a villager back. " +
		"A villager already carrying the goods home can't be called off — also cancellable from the villager panel.</div>";
	if(developer){ rows += "<div><b>`</b> Dev: cycle fast-forward (" + DEV_SPEEDS.join("x / ") + "x)</div>"; }

	var box = document.getElementById("hotkeyHelp");
	if(!box){
		box = document.createElement("div");
		box.id = "hotkeyHelp";
		box.className = "hidden";
		document.body.appendChild(box);
	}
	box.innerHTML = "<div id='hotkeyHelpBox'><h3>Hotkeys</h3>" + rows +
		"<p style='margin-top:10px;font-size:11px;color:#bbb;'>Press H to close</p></div>";
	$(box).on("click", function(){ toggleHotkeyHelp(); });
}

function toggleHotkeyHelp(){
	$("#hotkeyHelp").toggleClass("hidden");
}

// --- Dev-only speed toggle -------------------------------------------------

var devSpeedIndex = 0;

function toggleDevSpeed(){
	devSpeedIndex = (devSpeedIndex + 1) % DEV_SPEEDS.length;
	var mult = DEV_SPEEDS[devSpeedIndex];
	timeScale = 1 / mult;
	var id;
	// Actions read timeScale fresh when a task starts; only scouts + income need a poke.
	for(id in scoutBars){ scoutBars[id].setMaxTime(); }
	if(typeof restartIncome === "function"){ restartIncome(); }
	var btn = document.getElementById("devSpeedBtn");
	if(btn){ btn.innerHTML = "Speed: " + mult + "x"; }
	if(typeof newMsg === "function"){ newMsg("Dev speed: " + mult + "x"); }
}

function initDevMode(){
	if(!developer){ return; }
	$("#devPanel").removeClass("hidden");
	var btn = document.getElementById("devSpeedBtn");
	if(btn){
		btn.innerHTML = "Speed: 1x";
		$(btn).on("click", toggleDevSpeed);
	}
}
