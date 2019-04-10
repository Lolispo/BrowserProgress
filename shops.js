// Author Petter Andersson
"use strict"

function initShopButtons(){
	$(document.getElementById("shopBackButton")).on("click", function(){
		$(".shopMain").toggleClass("hidden", false);
		$(".shopEquipment").toggleClass("hidden", true);
		$(".shopResources").toggleClass("hidden", true);
		$(".shopHouses").toggleClass("hidden", true);
		$("#shopBackButton").toggleClass("hidden", true);
		document.getElementById("shopName").innerHTML = "Shop - Main"
	});


	$(document.getElementById("shopOpenEquipment")).on("click", function(){
		$(".shopMain").toggleClass("hidden", true);
		$(".shopEquipment").toggleClass("hidden", false);
		$(".shopResources").toggleClass("hidden", true);
		$(".shopHouses").toggleClass("hidden", true);
		$("#shopBackButton").toggleClass("hidden", false);
		document.getElementById("shopName").innerHTML = "Shop - Equipment"
	});

	$(document.getElementById("shopOpenResources")).on("click", function(){
		$(".shopMain").toggleClass("hidden", true);
		$(".shopEquipment").toggleClass("hidden", true);
		$(".shopResources").toggleClass("hidden", false);
		$(".shopHouses").toggleClass("hidden", true);
		$("#shopBackButton").toggleClass("hidden", false);
		document.getElementById("shopName").innerHTML = "Shop - Resources"
	});

	$(document.getElementById("shopOpenHouses")).on("click", function(){
		$(".shopMain").toggleClass("hidden", true);
		$(".shopEquipment").toggleClass("hidden", true);
		$(".shopResources").toggleClass("hidden", true);
		$(".shopHouses").toggleClass("hidden", false);
		$("#shopBackButton").toggleClass("hidden", false);
		document.getElementById("shopName").innerHTML = "Shop - Houses"
	});

	$(document.getElementById("axeShop")).on("click", function(){
		var woodCost = axeWoodPrice;
		var ironCost = axeIronPrice;
		if(wood >= woodCost && iron >= ironCost){
			wood -= woodCost;
			iron -= ironCost;
			axe++;
			upd("wood", wood);
			upd("iron", iron);
			upd("axe", axe);
			$('#axeDurabilityBar_innertext').text("Axe Durability " + axeDurability + "%");
			$('#axeDurabilityBar_innertext').toggleClass("innerTextRed", false);
			newMsg("Bought Axe!");
		}
	});
	$(document.getElementById("tradeAxeShop")).on("click", function(){
		var foodCost = axe2FoodPrice;
		if(food >= foodCost){
			food -= foodCost;
			axe++;
			upd("food", food);
			upd("axe", axe);
			$('#axeDurabilityBar_innertext').text("Axe Durability " + axeDurability + "%");
			$('#axeDurabilityBar_innertext').toggleClass("innerTextRed", false);
			newMsg("Bought Axe!");
		}
	});
	$(document.getElementById("spearShop")).on("click", function(){
		var woodCost = spearWoodPrice;
		if(wood >= woodCost){
			wood -= woodCost;
			spear++;
			upd("wood", wood);
			upd("spear", spear);
			$('#spearDurabilityBar_innertext').text("Spear Durability " + spearDurability + "%")
			$('#spearDurabilityBar_innertext').toggleClass("innerTextRed", false);
			newMsg("Bought Spear!");
		}
	});
	$(document.getElementById("tradeFoodShop")).on("click", function(){
		var woodCost = foodWoodPrice;
		if(wood >= woodCost){
			wood -= woodCost;
			food+=foodShopInc;
			upd("wood", wood);
			upd("food", food);
			newMsg("Bought 10 Food");
		}
	});

	$(document.getElementById("hireVillagerShop")).on("click", function(){
		var foodCost = villagerFoodPrice;
		if(food >= foodCost){
			if(villagers+1 > houses){
				newMsg("Requires more houses");
			}else{
				food -= foodCost;
				increaseVillagers();
				var image = imgVillager;
				ctx.drawImage(image, villagerXImg + ((image.width + image.width/5) * villagers), villagerYImg); 
				upd("food", food);
				upd("villagers", villagers);
				upd("unemployed", unemployed);
				newMsg("Hired a villager!");
			}
		}
	});
	$(document.getElementById("buildHousesShop")).on("click", function(){
		var woodCost = houseWoodPrice;
		var ironCost = houseIronPrice;
		if(wood >= woodCost && iron >= ironCost){
			wood -= woodCost;
			iron -= ironCost;
			housesBuilt++;
			houses += houseShopInc;
			var image = imgHouse;
			ctx.drawImage(image, houseXImg + ((image.width + image.width/5) * housesBuilt), houseYImg); 
			upd("wood", wood);
			upd("iron", iron);
			upd("houses", houses);
			newMsg("Built more houses!");
		}
	});	
	$(document.getElementById("buildLumberMillShop")).on("click", function(){
		var woodCost = lumberMillWoodPrice;
		var ironCost = lumberMillIronPrice;
		if(wood >= woodCost && iron >= ironCost){
			wood -= woodCost;
			iron -= ironCost;
			lumberMill++;
			if(lumberMill > 0){
				$("#jobColumn").toggleClass("hidden", false);
				$("#jobWoodCutter").toggleClass("hidden", false);
			}
			var image = imgLumberMill;
			ctx.drawImage(image, imgXStart + ((image.width + image.width/5) * lumberMill), lumberMillYImg); 
			upd("wood", wood);
			upd("iron", iron);
			//upd("lumberMill", lumberMill);
			newMsg("Built a LumberMill!");
		}
	});
	$(document.getElementById("buildMineShop")).on("click", function(){
		var woodCost = mineWoodPrice;
		var ironCost = mineIronPrice;
		if(wood >= woodCost && iron >= ironCost){
			wood -= woodCost;
			iron -= ironCost;
			mine++;
			if(mine > 0){
				$("#jobColumn").toggleClass("hidden", false);
				$("#jobIronWorker").toggleClass("hidden", false);
			}
			var image = imgMine;
			ctx.drawImage(image, imgXStart + ((image.width + image.width/5) * mine), mineYImg); 
			upd("wood", wood);
			upd("iron", iron);
			//upd("mine", mine);
			newMsg("Built a Mine!");
		}
	});
	$(document.getElementById("buildHuntingLodgeShop")).on("click", function(){
		var woodCost = huntingLodgeWoodPrice;
		var ironCost = huntingLodgeIronPrice;
		if(wood >= woodCost && iron >= ironCost){
			wood -= woodCost;
			iron -= ironCost;
			huntingLodge++;
			if(huntingLodge > 0){
				$("#jobColumn").toggleClass("hidden", false);
				$("#jobHunter").toggleClass("hidden", false);
			}
			var image = imgHuntingLodge;
			ctx.drawImage(image, imgXStart + ((image.width + image.width/5) * huntingLodge), huntingLodgeYImg); 
			upd("wood", wood);
			upd("iron", iron);
			//upd("huntingLodge", huntingLodge);
			newMsg("Built a HuntingLodge!");
		}
	});
	$(document.getElementById("buildTrainingYardShop")).on("click", function(){
		var woodCost = trainingYardWoodPrice;
		var ironCost = trainingYardIronPrice;
		if(wood >= woodCost && iron >= ironCost){
			wood -= woodCost;
			iron -= ironCost;
			trainingYard++;
			if(trainingYard > 0){
				$("#speedBar").toggleClass("hidden", false);
				$("#strengthBar").toggleClass("hidden", false);
				$("#cardioBar").toggleClass("hidden", false);
			}
			var image = imgTrainingYard;
			ctx.drawImage(image, imgXStart + ((image.width + image.width/5) * trainingYard), trainingYardYImg); 
			upd("wood", wood);
			upd("iron", iron);
			//upd("trainingYard", trainingYard);
			newMsg("Built a TrainingYard!");
		}
	});

}

function initShopSpecs(){
	var backButton = $(document.getElementById("shopBackButton"));
	var openHouse = $(document.getElementById("shopOpenHouses"));
	var openEquipment = $(document.getElementById("shopOpenEquipment"));
	var openResources = $(document.getElementById("shopOpenResources"));

	document.getElementById("shopBackButton").innerHTML = "<- Back";
	document.getElementById("shopOpenHouses").innerHTML = "Open Houses";
	document.getElementById("shopOpenEquipment").innerHTML = "Open Equipment";
	document.getElementById("shopOpenResources").innerHTML = "Open Resources";
	openHouse.toggleClass("shopMain", true);
	openEquipment.toggleClass("shopMain", true);
	openResources.toggleClass("shopMain", true);

	var axeShop = $(document.getElementById("axeShop"));
	document.getElementById("axeShop").innerHTML = "Axe ("+axeWoodPrice	+ " wood + " + axeIronPrice	+" iron)";
	axeShop.toggleClass("shopEquipment", true);
	var axe2Shop = $(document.getElementById("tradeAxeShop"))
	document.getElementById("tradeAxeShop").innerHTML = "Axe ("+axe2FoodPrice + " food)";
	axe2Shop.toggleClass("shopEquipment", true);
	var spearShop = $(document.getElementById("spearShop"));
	document.getElementById("spearShop").innerHTML = "Spear ("+spearWoodPrice	+ " spear)";
	spearShop.toggleClass("shopEquipment", true);
	var foodShop = $(document.getElementById("tradeFoodShop"));
	document.getElementById("tradeFoodShop").innerHTML = "Buy Food ("+foodWoodPrice	+ " wood)";
	foodShop.toggleClass("shopResources", true);
	var villagerShop = $(document.getElementById("hireVillagerShop"));
	document.getElementById("hireVillagerShop").innerHTML = "Hire Villager ("+villagerFoodPrice	+ " food)";
	villagerShop.toggleClass("shopMain", true);
	var houseShop = $(document.getElementById("buildHousesShop"));
	document.getElementById("buildHousesShop").innerHTML = "Build Farm Houses ("+houseWoodPrice	+ " wood + " + houseIronPrice	+" iron)";
	houseShop.toggleClass("shopHouses", true);
	var lumberMillShop = $(document.getElementById("buildLumberMillShop"));
	document.getElementById("buildLumberMillShop").innerHTML = "Build LumberMill ("+lumberMillWoodPrice	+ " wood + " + lumberMillIronPrice + " iron)";
	lumberMillShop.toggleClass("shopHouses", true);
	var mineShop = $(document.getElementById("buildMineShop"));
	document.getElementById("buildMineShop").innerHTML = "Build Mine ("+mineWoodPrice	+ " wood + " + mineIronPrice + " iron)";
	mineShop.toggleClass("shopHouses", true);
	var huntingLodgeShop = $(document.getElementById("buildHuntingLodgeShop"));
	document.getElementById("buildHuntingLodgeShop").innerHTML = "Build HuntingLodge ("+huntingLodgeWoodPrice	+ " wood + " + huntingLodgeIronPrice + " iron)";
	huntingLodgeShop.toggleClass("shopHouses", true);
	var trainingYardShop = $(document.getElementById("buildTrainingYardShop"));
	document.getElementById("buildTrainingYardShop").innerHTML = "Build TrainingYard ("+trainingYardWoodPrice	+ " wood + " + trainingYardIronPrice + " iron)";
	trainingYardShop.toggleClass("shopHouses", true);


	backButton.toggleClass("hidden", true);
	$(".shopMain").toggleClass("hidden", false);
	$(".shopEquipment").toggleClass("hidden", true);
	$(".shopResources").toggleClass("hidden", true);
	$(".shopHouses").toggleClass("hidden", true);
}
