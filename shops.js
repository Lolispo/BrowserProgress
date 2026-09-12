// Author Petter Andersson
"use strict"

// ===========================================================================
// The build bar: every purchase, one click, always on screen.
//
// This used to be a modal shop — open it, pick a category, buy, go back, close:
// four clicks to place a building, and the map hidden while you did it. The bar
// below sits over the map instead and shows everything you can currently buy at
// once, so buying is a single click and you can see the village you're building
// while you build it.
//
// It renders entirely from SHOP_ITEMS, so a new item is still one registry
// entry and no markup. Chips are created ONCE (handlers bound once, so the
// refresh that runs on every resource change can never eat a click); the
// refreshes below only touch classes and text.
//
// What the bar shows is "everything you could work toward right now", which is
// a narrower thing than "everything". Items used to be hidden until you already
// held half their cost, which made the answer to "what am I saving for?" *"you'll
// find out when you get there"*. Showing all fifteen instead swapped that for a
// wall. The rule that works:
//
//   OUT OF REACH  -> not on the bar at all. Either the building itself needs a
//                    region you have not claimed, or its price is in a resource
//                    that region introduces. You cannot obtain a single unit of
//                    stone before claiming the Hills, so a stone price is noise.
//   IN REACH      -> a full chip with a progress bar toward its own cost, whether
//                    or not you can afford it yet. This is the "saving for" set.
//
// So the bar grows as the map opens up, and everything on it is actionable. The
// next-goal hint in the top bar carries what comes after. The chip that hint
// points at is ringed, so the north-star and the button are the same object.
// ===========================================================================

// Building shop items -> the state count they represent (houses tracks housesBuilt).
var BUILDING_COUNT_KEY = {
	houses: "housesBuilt", lumberMill: "lumberMill", mine: "mine",
	huntingLodge: "huntingLodge", trainingYard: "trainingYard",
	quarry: "quarry", farm: "farm", blacksmith: "blacksmith",
	market: "market", monument: "monument",
};

// Emoji icon per shop item so a chip shows what you're buying at a glance.
var SHOP_ICONS = {
	// 🗡️ is a DAGGER — which is exactly why the spear looked like a sword in the
	// shop. No spear exists in Unicode; a trident is the nearest pole weapon.
	hireVillager: "🧑", axe: "🪓", tradeAxe: "🪓", spear: "🔱", food: "🍖",
	// Building icons deliberately avoid the resource icons below: a Mine showing
	// ⛏️ beside an iron cost of ⛏️80, or a Quarry showing 🪨 beside 🪨, reads as
	// one repeated symbol rather than "this building, that price".
	houses: "🏠", lumberMill: "🪵", mine: "🕳️", huntingLodge: "🏹",
	trainingYard: "🏋️", quarry: "⛰️", farm: "🌾", blacksmith: "⚒️",
	market: "🏪", monument: "🏛️",
};

// Cost icons match the resource chips in the top bar, so "🪵80" reads the same
// way in both places. Icons keep chips narrow enough to fit on one row.
var RES_ICONS = { wood: "🪵", iron: "⛏️", food: "🍖", stone: "🪨", gold: "💰", crystal: "💎" };

// Order the bar: the villager first, then goods, then things you build.
var BAR_ORDER = ["main", "goods", "houses"];

// Set by the 🛒 button. Kept apart from the automatic empty-bar hide below so
// that a bar the player collapsed stays collapsed when items are discovered.
var barCollapsed = false;
// False until the first affordability pass has run, so a page load doesn't fire
// the "you can afford it!" flourish on everything at once.
var _barReady = false;

// Which region introduces each resource — built once from REGIONS, so adding a
// region with a new resource needs no change here.
var RES_REGION = null;
function resRegion(k){
	if(!RES_REGION){
		RES_REGION = {};
		for(var id in REGIONS){ if(REGIONS[id].resource){ RES_REGION[REGIONS[id].resource] = id; } }
	}
	return RES_REGION[k] || null;
}

// Can you make any progress toward this at all today? A building gated on an
// unclaimed region can't be bought at any price, and neither can anything priced
// in a resource that region is the only source of.
function inReach(item){
	if(item.region && !state.regions[item.region]){ return false; }
	for(var k in item.cost){
		var r = resRegion(k);
		if(r && !state.regions[r]){ return false; }
	}
	return true;
}

// How close you are to affording something: the WORST resource decides, because
// that is the one actually holding you up.
function costProgress(cost){
	if(!cost){ return 1; }
	var worst = 1;
	for(var k in cost){ worst = Math.min(worst, Math.min(1, state[k] / cost[k])); }
	return worst;
}

// "Build LumberMill" -> "LumberMill". The chip has an icon and a cost beside it;
// the verb is dead weight at this size. Full name stays in the tooltip.
function chipName(item){ return item.name.replace(/^Build (the )?/i, ""); }

function initShopButtons(){
	var bar = document.getElementById("buildBar");
	if(!bar){ return; }
	var ids = [];
	for(var c = 0; c < BAR_ORDER.length; c++){
		for(var id in SHOP_ITEMS){ if(SHOP_ITEMS[id].category === BAR_ORDER[c]){ ids.push(id); } }
		// A divider between goods and buildings; hidden when either side is empty
		// (see updateShopVisibility), so it never dangles at the end of the bar.
		if(c < BAR_ORDER.length - 1){ ids.push(null); }
	}

	var html = "", sep = 0;
	for(var i = 0; i < ids.length; i++){
		if(ids[i] === null){ html += "<span class='chipSep' id='chipSep" + (sep++) + "'></span>"; continue; }
		var item = SHOP_ITEMS[ids[i]];
		item._tip = tipText(item);   // authored text; refreshShopColors appends the shortfall
		html += "<button type='button' class='buyChip' id='" + item.btnId + "'" +
			" data-tip=\"" + item._tip + "\">" +
			"<span class='chipIcon'>" + (SHOP_ICONS[ids[i]] || "•") + "</span>" +
			"<span class='chipBody'>" +
				"<span class='chipName'>" + chipName(item) +
					"<span class='chipCount' id='" + item.btnId + "_n'></span></span>" +
				"<span class='chipCost' id='" + item.btnId + "_c'></span>" +
			"</span>" +
			"<span class='chipBadge' id='" + item.btnId + "_b'></span>" +
			"<span class='chipProg'><i id='" + item.btnId + "_p'></i></span>" +
			"</button>";
	}
	bar.innerHTML = html;

	for(var id2 in SHOP_ITEMS){
		(function(boundItem){
			$("#" + boundItem.btnId).on("click", function(){ buyItem(boundItem); });
		})(SHOP_ITEMS[id2]);
	}

	// 🛒 toggles the bar away when you'd rather just watch the village.
	$("#btnShop").on("click", function(){
		barCollapsed = !barCollapsed;
		updateShopVisibility();
	});

	updateShopLabels();
	updateShopVisibility();
	refreshShopColors();
}

// Attempt to buy an item: gated by cost, requirements, and an optional canBuy().
function buyItem(item){
	if(item.canBuy && !item.canBuy()){
		if(item.onBlocked){ item.onBlocked(); }
		return;
	}
	if(!canAfford(item.cost) || !meetsRequirements(item.requires)){ return; }
	payCost(item.cost);
	item.onBuy();
	updateShopLabels();
	updateShopVisibility();
	refreshShopColors();
	if(typeof refreshScouts === "function"){ refreshScouts(); }
}

// Cost line + "×N built" badge. Each cost part is its own span so the
// affordability pass can mark just the resource you're short of.
function updateShopLabels(){
	for(var id in SHOP_ITEMS){
		var item = SHOP_ITEMS[id];
		var costEl = document.getElementById(item.btnId + "_c");
		if(costEl){
			var parts = "";
			for(var k in item.cost){
				parts += "<span class='cPart' data-res='" + k + "'>" +
					(RES_ICONS[k] || "") + item.cost[k] + "</span>";
			}
			costEl.innerHTML = parts || "<span class='cPart'>free</span>";
		}
		var nEl = document.getElementById(item.btnId + "_n");
		if(nEl){
			var ck = BUILDING_COUNT_KEY[id];
			nEl.innerHTML = (ck && state[ck] > 0) ? (" ×" + state[ck]) : "";
		}
	}
}

// What is actually standing between you and this purchase, in words. Appended
// to the authored tooltip on every refresh, so hovering anything on the bar
// tells you exactly what to go and get.
function shortfallText(item){
	if(item.region && !state.regions[item.region]){
		return " — Locked until you claim the " + REGIONS[item.region].label + ".";
	}
	var missing = [];
	for(var k in item.cost){
		var d = item.cost[k] - state[k];
		if(d > 0){ missing.push(Math.ceil(d) + " more " + k); }
	}
	if(missing.length){ return " — Still need: " + missing.join(", ") + "."; }
	if(item.canBuy && !item.canBuy()){ return " — " + (item.blockedWhy || "Not available yet."); }
	if(!meetsRequirements(item.requires)){ return " — Requirements not met yet."; }
	return " — Ready to buy.";
}

// Grey out what you can't buy yet, redden the individual resource you're short
// of, and fill each chip's progress bar toward its own cost — so a chip answers
// "what am I missing, and how close am I?" rather than just "no".
function refreshShopColors(){
	for(var id in SHOP_ITEMS){
		var item = SHOP_ITEMS[id];
		var reach = inReach(item);
		var ok = reach && canAfford(item.cost) && meetsRequirements(item.requires) &&
			(!item.canBuy || item.canBuy());
		var $chip = $("#" + item.btnId);
		// The moment something becomes buyable is worth celebrating — you have been
		// watching that progress bar creep. Skip the very first pass, or a reload
		// would set off every chip at once.
		if(ok && item._wasOk === false && _barReady){
			flourish(item.btnId);
		}
		item._wasOk = ok;
		$chip.toggleClass("ready", ok);
		$chip.toggleClass("unaffordable", !ok);
		$chip.toggleClass("locked", !reach);
		$chip.find(".cPart").each(function(){
			var k = this.getAttribute("data-res");
			$(this).toggleClass("short", !!k && state[k] < item.cost[k]);
		});
		var prog = costProgress(item.cost);
		var bar = document.getElementById(item.btnId + "_p");
		if(bar){ bar.style.width = Math.round(prog * 100) + "%"; }
		// "Nearly" is the state worth catching out of the corner of your eye: not
		// buyable yet, but one more trip away.
		$chip.toggleClass("nearly", !ok && reach && prog >= 0.75);
		var el = document.getElementById(item.btnId);
		if(el){ el.setAttribute("data-tip", (item._tip || "") + shortfallText(item)); }
	}
	refreshNextMarker();
	_barReady = true;
}

// Play the "you can finally afford it" flourish on one chip. Takes the id rather
// than the element because the cleanup is deferred: `var` in the caller's for-in
// loop is function-scoped, so a captured reference would be whatever the loop
// happened to end on by the time the timer fired, and the wrong chip would keep
// the class.
function flourish(btnId){
	var el = document.getElementById(btnId);
	if(!el){ return; }
	el.classList.remove("justAfforded");
	void el.offsetWidth;                 // restart it if one is already mid-flight
	el.classList.add("justAfforded");
	setTimeout(function(){
		var e2 = document.getElementById(btnId);
		if(e2){ e2.classList.remove("justAfforded"); }
	}, 1100);
}

// Ring whichever chip the next-goal hint is currently pointing at. `nextGoalItem`
// is set by goalBuy() in script.js as that hint is computed, so the advice at the
// top of the screen and the button to act on it are never out of step.
function refreshNextMarker(){
	for(var id in SHOP_ITEMS){
		$("#" + SHOP_ITEMS[id].btnId).toggleClass("isNext",
			typeof nextGoalItem !== "undefined" && nextGoalItem === id);
	}
}

// Badge slot: the buy hotkey if it has one, or the region it is waiting on.
// Also toggles the whole bar (it exists as soon as the game does, now that
// nothing is hidden — only the player's own 🛒 collapse can take it away).
function updateShopVisibility(){
	var any = false;
	for(var id in SHOP_ITEMS){
		var item = SHOP_ITEMS[id];
		var show = inReach(item);
		$("#" + item.btnId).toggleClass("hidden", !show).toggleClass("hasKey", !!item.key);
		var badge = document.getElementById(item.btnId + "_b");
		if(badge){ badge.innerHTML = item.key ? item.key.toUpperCase() : ""; }
		if(show){ any = true; }
	}
	// Dividers between the groups, hidden when either side of them is empty.
	var visibleIn = {};
	for(var id2 in SHOP_ITEMS){ if(inReach(SHOP_ITEMS[id2])){ visibleIn[SHOP_ITEMS[id2].category] = true; } }
	for(var i = 0; i < BAR_ORDER.length - 1; i++){
		var before = false, after = false;
		for(var c = 0; c < BAR_ORDER.length; c++){
			if(!visibleIn[BAR_ORDER[c]]){ continue; }
			if(c <= i){ before = true; } else { after = true; }
		}
		$("#chipSep" + i).toggleClass("hidden", !(before && after));
	}
	$("#buildBar").toggleClass("hidden", barCollapsed || !any);
	$("#btnShop").toggleClass("menuBtnOff", barCollapsed);
}
