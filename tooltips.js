// Author Petter Andersson
"use strict"

// Tooltips are generated from registry data so the hover text can never drift
// out of sync with an action/item's real requirements. Every hoverable element
// carries a data-tip attribute; a single floating box renders it near the cursor.

// Build the tooltip string for a registry entry: authored sentence plus an
// auto-generated "Requires:" footer derived from the entry's requires data.
function tipText(entry){
	var text = entry.tooltip || "";
	if(entry.requires && entry.requires.length){
		var reqs = entry.requires.map(prettyReq);
		text += " (Requires: " + reqs.join(", ") + ")";
	}
	if(entry.key){ text += "  [Key: " + entry.key.toUpperCase() + "]"; }
	return text.replace(/"/g, "&quot;");
}

function prettyReq(r){
	if(r.key === "energy"){ return "energy ≥ " + r.min + "%"; }
	return r.min + " " + r.key;
}

// One floating box, positioned by the cursor, shared by all [data-tip] elements.
// Delegated handlers so elements created later (shop buttons, bars) work too.
function initTooltips(){
	var box = document.getElementById("tooltipBox");
	if(!box){
		box = document.createElement("div");
		box.id = "tooltipBox";
		document.body.appendChild(box);
	}
	$(document).on("mouseenter", "[data-tip]", function(){
		box.innerHTML = $(this).attr("data-tip");
		box.style.display = "block";
	});
	$(document).on("mousemove", "[data-tip]", function(e){
		box.style.left = (e.clientX + 14) + "px";
		box.style.top = (e.clientY + 14) + "px";
	});
	$(document).on("mouseleave", "[data-tip]", function(){
		box.style.display = "none";
	});

	// Touch has no hover, and every "what am I still missing?" answer in this game
	// lives in a tooltip. Pressing shows it; releasing hides it. The click still
	// fires on release, so a tap both tells you about the thing and buys it if you
	// can afford it — and on something you can't afford, the tap is just the
	// explanation, which is exactly what you wanted from it.
	$(document).on("touchstart", "[data-tip]", function(e){
		var t = e.originalEvent.touches[0];
		box.innerHTML = $(this).attr("data-tip");
		box.style.display = "block";
		// Above the finger, and kept on screen.
		var w = box.offsetWidth || 220;
		box.style.left = Math.max(6, Math.min(window.innerWidth - w - 6, t.clientX - w / 2)) + "px";
		box.style.top = Math.max(6, t.clientY - (box.offsetHeight || 40) - 18) + "px";
	});
	$(document).on("touchend touchcancel", "[data-tip]", function(){
		box.style.display = "none";
	});
}
