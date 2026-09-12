// Author Petter Andersson
"use strict"

// Top-bar menu icons open their panel as an overlay over the map. One overlay at
// a time: clicking an icon toggles its overlay (and closes any other); the ✕ or
// clicking the icon again closes it.
function initUI(){
	// 🛒 Build and 🎒 Gear are NOT in here: they expand and collapse panels that
	// live on the map permanently, rather than opening a menu over it.
	var overlays = {
		btnJobs: "jobsOverlay",
		btnGoal: "goalOverlay",
		btnMessages: "messagesOverlay",
		btnSettings: "settingsOverlay",
	};

	function closeAll(){
		$(".overlay").addClass("hidden");
		deselectVillager();
	}

	function deselectVillager(){
		$("#villagerPanel").addClass("hidden");
		if(typeof scene !== "undefined"){ scene.selected = null; }
	}

	for(var btn in overlays){
		(function(id, ov){
			$("#" + id).on("click", function(){
				var willOpen = $("#" + ov).hasClass("hidden");
				closeAll();
				if(willOpen){
					$("#" + ov).removeClass("hidden");
					}
			});
		})(btn, overlays[btn]);
	}

	$(".overlayClose").on("click", closeAll);
	$("#villagerClose").on("click", deselectVillager);

	// Clicking anywhere outside an overlay closes the menus. Ignore clicks on a
	// menu button (its own handler toggles) and clicks inside an overlay.
	$(document).on("mousedown", function(e){
		var $t = $(e.target);
		if($t.closest(".overlay").length || $t.closest("#menuBar, #menuBarLeft").length){ return; }
		if($t.closest("#buildBar, #hudDock").length){ return; } // on-map panels, not the map
		closeAll();
	});

	// Escape closes any open overlay (and the hotkey help).
	$(document).on("keydown", function(e){
		if(e.key === "Escape"){ closeAll(); $("#hotkeyHelp").addClass("hidden"); }
	});

	// Click a villager on the map to inspect them; empty space just closes menus.
	// Delegated, because the map surface belongs to the active renderer and is
	// replaced wholesale when the graphics are switched. Asking the renderer to
	// pick is the only place input has to know which one is installed: the 2D
	// view inverts its camera transform, the 3D view casts a ray.
	$("#mapWrap").on("click", "canvas", function(e){
		if(!Renderer){ return; }
		if(Renderer.swallowClick && Renderer.swallowClick()){ return; } // ended a camera drag
		var v = Renderer.pick(e.clientX, e.clientY);
		closeAll();
		if(v){
			scene.selected = v;
			$("#villagerPanel").removeClass("hidden");
			if(typeof openVillagerPanel === "function"){ openVillagerPanel(); }
		}
	});
}
