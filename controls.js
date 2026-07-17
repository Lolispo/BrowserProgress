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
var DEV_SPEED_KEY = "`"; // backtick toggles the dev fast-forward

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
	rows += "<div><b>H</b> Toggle this help</div>";
	if(developer){ rows += "<div><b>`</b> Dev: toggle fast-forward</div>"; }

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

function toggleDevSpeed(){
	timeScale = (timeScale === 1) ? 0.2 : 1;
	var id;
	for(id in barObjects){ barObjects[id].setMaxTime(); }
	for(id in scoutBars){ scoutBars[id].setMaxTime(); }
	if(typeof restartIncome === "function"){ restartIncome(); }
	var btn = document.getElementById("devSpeedBtn");
	if(btn){ btn.innerHTML = "Speed: " + (timeScale === 1 ? "1x" : "5x"); }
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
