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
		btnEquipment: "equipmentOverlay",
		btnMessages: "messagesOverlay",
		btnSettings: "settingsOverlay",
	};

	function closeAll(){
		$(".overlay").addClass("hidden"); // covers villagerOverlay (no menu button)
		if(typeof scene !== "undefined"){ scene.selected = null; }
	}

	for(var btn in overlays){
		(function(id, ov){
			$("#" + id).on("click", function(){
				var willOpen = $("#" + ov).hasClass("hidden");
				closeAll();
				if(willOpen){
					$("#" + ov).removeClass("hidden");
					// Refresh the equipment list on open so durability is current.
					if(ov === "equipmentOverlay" && typeof updateEquipmentPanel === "function"){ updateEquipmentPanel(); }
				}
			});
		})(btn, overlays[btn]);
	}

	$(".overlayClose").on("click", closeAll);

	// Clicking anywhere outside an overlay closes the menus. Ignore clicks on a
	// menu button (its own handler toggles) and clicks inside an overlay.
	$(document).on("mousedown", function(e){
		var $t = $(e.target);
		if($t.closest(".overlay").length || $t.closest("#menuBar, #menuBarLeft").length){ return; }
		closeAll();
	});

	// Escape closes any open overlay (and the hotkey help).
	$(document).on("keydown", function(e){
		if(e.key === "Escape"){ closeAll(); $("#hotkeyHelp").addClass("hidden"); }
	});

	// Click a villager on the map to inspect them; empty space just closes menus.
	$("#canvas1").on("click", function(e){
		var v = scene.pickVillager(e.clientX, e.clientY);
		closeAll();
		if(v){
			scene.selected = v;
			$("#villagerOverlay").removeClass("hidden");
			if(typeof openVillagerPanel === "function"){ openVillagerPanel(); }
		}
	});
}
