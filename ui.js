// Author Petter Andersson
"use strict"

// Top-bar menu icons open their panel as an overlay over the map. One overlay at
// a time: clicking an icon toggles its overlay (and closes any other); the ✕ or
// clicking the icon again closes it.
function initUI(){
	var overlays = {
		btnShop: "shopOverlay",
		btnJobs: "jobsOverlay",
		btnGoal: "goalOverlay",
		btnMessages: "messagesOverlay",
		btnSettings: "settingsOverlay",
	};

	function closeAll(){
		for(var k in overlays){ $("#" + overlays[k]).addClass("hidden"); }
	}

	for(var btn in overlays){
		(function(id, ov){
			$("#" + id).on("click", function(){
				var willOpen = $("#" + ov).hasClass("hidden");
				closeAll();
				if(willOpen){ $("#" + ov).removeClass("hidden"); }
			});
		})(btn, overlays[btn]);
	}

	$(".overlayClose").on("click", closeAll);
}
