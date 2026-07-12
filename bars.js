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
		"<div class='innertext' id='" + barName + "_innertext'></div></div>");
	$('#' + barName + '_innertext').text(action.label);
	$('#' + barName + '_innerdiv').css("width", "100%");

	// Recompute duration from the current player speed (called before each run).
	this.setMaxTime = function(){
		self.maxTime = (action.maxTime() * speedRatio).toFixed(1);
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
