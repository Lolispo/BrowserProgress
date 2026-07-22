// Author Petter Andersson
"use strict"

// A clickable progress bar driven by an entry from the ACTIONS registry.
// The action object supplies label / requires / maxTime() / onStart() / onDone();
// this class only handles the DOM, timing animation, and the click gate.
function TimeBar(action){
	var barName = action.barId;
	var self = this;

	this.action = action;
	this.start = new Date();
	this.maxTime = 1000;
	this.timeoutVal = 10;
	this.clickable = true;

	$('#' + barName).append(
		"<div class='outerdiv' id='" + barName + "_outerdiv' data-tip=\"" + tipText(action) + "\">" +
		"<div class='innerdiv' id='" + barName + "_innerdiv'></div>" +
		"<div class='innertext' id='" + barName + "_innertext'></div>" +
		(action.key ? "<div class='barKey'>" + action.key.toUpperCase() + "</div>" : "") +
		"</div>");
	$('#' + barName + '_innertext').text(action.label);
	$('#' + barName + '_innerdiv').css("width", "100%");

	// Recompute duration from the current player speed (called before each run).
	// rawTime actions (scouts) use their ms value directly, unscaled.
	this.setMaxTime = function(){
		var base = action.maxTime();
		self.maxTime = ((action.rawTime ? base : base * speedRatio) * timeScale).toFixed(1);
		self.timeoutVal = Math.floor(self.maxTime / 100);
	};
	this.setMaxTime();

	this.updateProgress = function(percentage){
		var text = percentage + "%";
		if(percentage === 100){
			text = action.label;
			action.onDone();
			self.clickable = true;
		} else {
			self.clickable = false;
		}
		$('#' + barName + '_innerdiv').css("width", percentage + "%");
		$('#' + barName + '_innertext').text(text);
	};

	this.animateUpdate = function(){
		var now = new Date();
		var timeDiff = now.getTime() - self.start.getTime();
		var perc = Math.round((timeDiff / self.maxTime) * 100);
		if(perc < 100){
			self.updateProgress(perc);
			setTimeout(self.animateUpdate, self.timeoutVal);
		} else {
			self.updateProgress(100);
		}
	};

	$(document.getElementById(barName + "_outerdiv")).on("click", function(){
		if(self.clickable && meetsRequirements(action.requires)){
			self.setMaxTime(); // in case speed changed since last run
			self.start = new Date();
			action.onStart();
			self.animateUpdate();
		}
	});
}

// An action row is a dispatch button: clicking sends a free villager to do the
// action (see scene.startTask). Progress shows on the villager, not here.
function ActionButton(id, action){
	var barName = action.barId;
	$('#' + barName).append(
		"<div class='outerdiv actionBtn' id='" + barName + "_outerdiv' data-tip=\"" + tipText(action) + "\">" +
		"<div class='innertext' id='" + barName + "_innertext'>" + action.label + "</div>" +
		(action.key ? "<div class='barKey'>" + action.key.toUpperCase() + "</div>" : "") +
		"<div class='queueBadge hidden' id='" + barName + "_q'></div>" +
		"</div>" +
		"<button type='button' class='autoBtn' id='" + barName + "_auto' data-tip=\"Auto-repeat: keep dispatching this action while a villager and (if needed) a tool are free. Auto-stops if it becomes impossible.\">A</button>");
	$(document.getElementById(barName + "_outerdiv")).on("click", function(){ dispatchAction(id); });
	$(document.getElementById(barName + "_auto")).on("click", function(){ toggleAuto(id); });
}

// --- auto-repeat ("auto chop") --------------------------------------------
// A per-action toggle keeps dispatching the action whenever it's runnable, and
// auto-stops when it becomes impossible (requirement lost / no tool exists at
// all). A momentary "no free villager / all tools in use" is temporary, so it
// keeps the toggle on and just waits for a worker/tool to free up.
var autoActions = {};
// One-off orders the player queued (by clicking a bar / pressing its hotkey). The
// driver drains these with PRIORITY over auto-repeat, so pressing e.g. Mine Iron
// while Auto Chop is on jumps a single mine order ahead of the auto dispatch.
var manualQueue = [];

function toggleAuto(id){
	autoActions[id] = !autoActions[id];
	$("#" + ACTIONS[id].barId + "_auto").toggleClass("autoOn", !!autoActions[id]);
}

// Can this action be dispatched right now? Single source of truth: it's exactly
// "no blocking reason" (worker + tool + requirements), so the tooltip and the
// auto-driver can never drift apart.
function canDispatch(a){ return !blockReason(a); }

// A permanent block that only player action can clear (so auto should give up).
function autoHardStop(a){
	if(!meetsRequirements(a.requires)){ return true; }
	if(a.tool){ var arr = (a.tool === "axe") ? state.axes : state.spears; if(!arr.length){ return true; } }
	return false;
}

// Actually send a free villager to perform an action once. Returns true if a
// villager was dispatched, false if nothing was runnable right now.
function runDispatch(id){
	var action = ACTIONS[id];
	if(!meetsRequirements(action.requires)){ return false; }
	if(action.tool && !(action.tool === "axe" ? freeAxe() : freeSpear())){ return false; } // need a free tool
	// Sleep sends the most-tired free villager; everything else the most-rested.
	var v = (id === "sleep") ? scene.tiredestFreeVillager() : scene.freeVillager();
	if(!v){ return false; }
	scene.startTask(v, id);
	return true;
}

// Drain the player's queued orders FIFO. A head whose requirement is permanently
// gone is dropped; one that only lacks a free villager/tool is kept (we stop and
// wait), preserving order and priority over auto.
function drainManualQueue(){
	while(manualQueue.length){
		var id = manualQueue[0];
		var a = ACTIONS[id];
		if(autoHardStop(a)){ manualQueue.shift(); newMsg(a.label + " not possible"); continue; }
		if(!runDispatch(id)){ break; }
		manualQueue.shift();
	}
}

function autoDriverTick(){
	drainManualQueue(); // player's one-off orders always dispatch before auto
	for(var id in autoActions){
		if(!autoActions[id]){ continue; }
		var a = ACTIONS[id];
		if(autoHardStop(a)){ toggleAuto(id); newMsg("Auto " + a.label + " stopped"); continue; }
		if(canDispatch(a)){ runDispatch(id); }
	}
	refreshQueueBadges();
}

// Player clicked a bar or pressed its hotkey: queue one order and try to run it
// immediately. If no villager is free it stays queued (with priority over auto).
function dispatchAction(id){
	manualQueue.push(id);
	drainManualQueue();
	refreshQueueBadges();
}

// Show a count badge on any action bar with orders still waiting in the queue.
function refreshQueueBadges(){
	var counts = {};
	for(var i = 0; i < manualQueue.length; i++){ counts[manualQueue[i]] = (counts[manualQueue[i]] | 0) + 1; }
	for(var id in ACTIONS){
		var el = document.getElementById(ACTIONS[id].barId + "_q");
		if(!el){ continue; }
		var n = counts[id] || 0;
		el.innerHTML = n ? String(n) : "";
		el.classList.toggle("hidden", n === 0);
	}
}

// Dispatch a SPECIFIC villager to an action (from the inspect panel). Reuses the
// tool/requirement gating, but intentionally allows commanding an *employed*
// villager (only `busy` blocks) — direct control is the point of the panel; they
// return to their job post when done. Passive income is count-based, so pulling a
// worker off briefly doesn't drop their income.
function dispatchActionFor(v, id){
	if(!v){ return; }
	var a = ACTIONS[id];
	if(v.busy){ newMsg("That villager is busy"); return; }
	if(!meetsRequirements(a.requires)){ return; }
	if(a.tool && !(a.tool === "axe" ? freeAxe() : freeSpear())){ newMsg("No free " + a.tool); return; }
	scene.startTask(v, id);
	if(typeof refreshVillagerPanel === "function"){ refreshVillagerPanel(); }
}

function initBars(){
	for(var id in ACTIONS){
		new ActionButton(id, ACTIONS[id]);
		if(ACTIONS[id].startsHidden){
			$("#" + ACTIONS[id].barId).toggleClass("hidden", true);
		}
	}
	setInterval(autoDriverTick, 250); // drive any auto-enabled actions
}

// Why can't this action be dispatched right now? Returns the most actionable
// reason (or null if it's runnable). Surfaced in the tooltip so "greyed out"
// always explains itself — e.g. "No axe — buy one in Shop".
function blockReason(a){
	if(!meetsRequirements(a.requires)){
		return "Requires " + a.requires.map(prettyReq).join(", ");
	}
	if(a.tool && !(a.tool === "axe" ? freeAxe() : freeSpear())){
		var have = (a.tool === "axe") ? state.axes.length : state.spears.length;
		return have ? ("All " + a.tool + "s in use") : ("No " + a.tool + " — buy one in 🛒 Shop");
	}
	if(!scene.freeVillager()){ return "No free villager (all busy)"; }
	return null;
}

// Grey out un-dispatchable action bars AND refresh their tooltip with the reason.
// Throttled from the scene loop.
function refreshBarStates(){
	for(var id in ACTIONS){
		var a = ACTIONS[id];
		var reason = blockReason(a);
		$("#" + a.barId + "_outerdiv")
			.toggleClass("barUnavailable", !!reason)
			.attr("data-tip", tipText(a) + (reason ? "  <span class='tipWarn'>⚠ " + reason + "</span>" : ""));
	}
	// Scout bars grey out when you lack the villagers to send.
	for(var sid in SCOUTS){
		var s = SCOUTS[sid];
		$("#" + s.barId + "_outerdiv").toggleClass("barUnavailable", !meetsRequirements(s.requires));
	}
	// Keep the open villager inspect panel's live values current.
	if(typeof refreshVillagerPanel === "function"){ refreshVillagerPanel(); }
}

// Live scout bar instances, keyed by region id.
var scoutBars = {};

function initScouts(){
	for(var id in SCOUTS){
		(function(s){
			// Occupy villagers for the run; return them and claim the region on done.
			s.onStart = function(){
				set("unemployed", state.unemployed - s.villagers);
				newMsg("Scouting the " + REGIONS[s.region].label + "...");
			};
			s.onDone = function(){
				set("unemployed", state.unemployed + s.villagers);
				scene.revealRegion(s.region);
				newMsg("Claimed the " + REGIONS[s.region].label + "!");
				if(s.region === "cavern"){ $("#crystalBar").toggleClass("hidden", false); }
				refreshScouts();
				if(typeof updateShopVisibility === "function"){ updateShopVisibility(); }
				if(typeof refreshShopColors === "function"){ refreshShopColors(); }
			};
			scoutBars[id] = new TimeBar(s);
		})(SCOUTS[id]);
	}
	refreshScouts();
}

// A scout bar shows once its gate building exists and its region is unclaimed.
function refreshScouts(){
	var anyVisible = false;
	for(var id in SCOUTS){
		var s = SCOUTS[id];
		var show = state[s.gate] > 0 && !state.regions[s.region];
		$("#" + s.barId).toggleClass("hidden", !show);
		if(show){ anyVisible = true; }
	}
	$("#scoutHeader").toggleClass("hidden", !anyVisible);
}
