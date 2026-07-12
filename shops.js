// Author Petter Andersson
"use strict"

// The shop renders entirely from the SHOP_ITEMS / SHOP_NAV registries.
// One generic buy handler, one generic affordability-colouring pass, and one
// category switcher replace the old per-button copy-pasted handlers.

function cap(s){ return s.charAt(0).toUpperCase() + s.slice(1); }

// Attempt to buy an item: gated by cost, requirements, and an optional canBuy().
function buyItem(item){
	if(item.canBuy && !item.canBuy()){
		if(item.onBlocked){ item.onBlocked(); }
		return;
	}
	if(!canAfford(item.cost) || !meetsRequirements(item.requires)){ return; }
	payCost(item.cost);
	item.onBuy();
	refreshShopColors();
	if(typeof refreshScouts === "function"){ refreshScouts(); }
}

// Grey out items that are currently unaffordable / gated, and highlight the
// category buttons that contain at least one affordable item.
function refreshShopColors(){
	var affordableByCategory = {};
	for(var id in SHOP_ITEMS){
		var item = SHOP_ITEMS[id];
		var ok = canAfford(item.cost) && meetsRequirements(item.requires) &&
			(!item.canBuy || item.canBuy());
		$("#" + item.btnId).toggleClass("unaffordable", !ok);
		affordableByCategory[item.category] = affordableByCategory[item.category] || ok;
	}
	for(var i = 0; i < SHOP_NAV.length; i++){
		var nav = SHOP_NAV[i];
		$("#" + nav.btnId).toggleClass("hasAffordable", !!affordableByCategory[nav.show]);
	}
}

// Show one shop category (main | equipment | resources | houses).
function showCategory(category){
	$(".shopMain").toggleClass("hidden", category !== "main");
	$(".shopEquipment").toggleClass("hidden", category !== "equipment");
	$(".shopResources").toggleClass("hidden", category !== "resources");
	$(".shopHouses").toggleClass("hidden", category !== "houses");
	$("#shopBackButton").toggleClass("hidden", category === "main");
	document.getElementById("shopName").innerHTML =
		category === "main" ? "Shop - Main" : "Shop - " + cap(category);
}

function initShopButtons(){
	// Purchasable items
	for(var id in SHOP_ITEMS){
		var item = SHOP_ITEMS[id];
		var el = document.getElementById(item.btnId);
		el.innerHTML = item.name + " (" + costToText(item.cost) + ")";
		el.setAttribute("data-tip", tipText(item));
		$(el).toggleClass("shop" + cap(item.category), true);
		(function(boundItem){
			$(el).on("click", function(){ buyItem(boundItem); });
		})(item);
	}

	// Category navigation buttons (live on the main screen)
	for(var i = 0; i < SHOP_NAV.length; i++){
		(function(nav){
			var navEl = document.getElementById(nav.btnId);
			navEl.innerHTML = nav.label;
			$(navEl).toggleClass("shopMain", true);
			$(navEl).on("click", function(){ showCategory(nav.show); });
		})(SHOP_NAV[i]);
	}

	// Back button returns to the main screen
	document.getElementById("shopBackButton").innerHTML = "<- Back";
	$(document.getElementById("shopBackButton")).on("click", function(){ showCategory("main"); });

	refreshShopColors();
	showCategory("main");
}
