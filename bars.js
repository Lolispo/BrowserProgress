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
		if(sleeping && action.barId !== "sleepBar"){ return; } // asleep: only the sleep bar works
		if(self.clickable && meetsRequirements(action.requires)){
			self.setMaxTime(); // in case speed changed since last run
			self.start = new Date();
			action.onStart();
			self.animateUpdate();
		}
	});
}

// Registry of live bar instances, keyed by action id.
var barObjects = {};

function initBars(){
	for(var id in ACTIONS){
		barObjects[id] = new TimeBar(ACTIONS[id]);
		if(ACTIONS[id].startsHidden){
			$("#" + ACTIONS[id].barId).toggleClass("hidden", true);
		}
	}
}

// Grey out action bars whose requirements aren't currently met (e.g. Chop Wood
// with no axe, or Hunt below the energy threshold). Called throttled from the
// scene loop so it always reflects current state.
function refreshBarStates(){
	for(var id in ACTIONS){
		var a = ACTIONS[id];
		// While asleep every bar but the sleep bar is locked.
		var ok = meetsRequirements(a.requires) && (!sleeping || a.barId === "sleepBar");
		$("#" + a.barId + "_outerdiv").toggleClass("barUnavailable", !ok);
	}
	// Scout bars grey out when you lack villagers, or while asleep.
	for(var sid in SCOUTS){
		var s = SCOUTS[sid];
		$("#" + s.barId + "_outerdiv").toggleClass("barUnavailable", !meetsRequirements(s.requires) || sleeping);
	}
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
