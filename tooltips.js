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
}
