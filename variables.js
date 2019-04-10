// Author Petter Andersson
"use strict"


// Important global vars
var speedRatio = 0.1; // Speedratio of bars
var incomeInterval = null; // Used for job income
var energyInterval = null; // Used for energy increase for energy meter
var ctx = null; // the canvas 2d graphics
var developer = true; // Used to give more resources if true | Should be off when not developing

// Inventory
var wood = 0;
var iron = 0;
var axe = 1;
var spear = 1;
var food = 0;
var villagers = 0;

var housesBuilt = 0;
var houses = 2;
var lumberMill = 0;
var mine = 0;
var huntingLodge = 0;
var trainingYard = 0;

// Durability of special bars
var axeDurability = 100;
var spearDurability = 100;
var energy = 100;
var energyInc = 0.5; // Initializas direkt till cardio/200 (cardio = 100 -> 0.5)

// Speed
var woodSpeed = 2000000;
var ironSpeed = 6000000;
var huntSpeed = 8000000;
var clawTreeSpeed = 5000000; 

// Bars
var bars = []; // Not used atm
var woodBar;
var ironBar;
var huntBar;
var clawTreeBar;
var speedBar;
var strengthBar;
var cardioBar;

// Bars values - damage and requirements
var woodInc = 10;
var ironInc = 10;
var foodInc = 10;
var clawInc = 2;
var axeWoodDmg = 5;
var axeIronDmg = 5;
var spearHuntDmg = 5;
var successHuntRate = 60; 
var huntEnergyReq = 80;
var huntEnergyCost = 0.4;
var clawEnergyReq = 50;
var clawEnergyCost = 0.6;

// Shop Prices
var axeWoodPrice = 50;
var axeIronPrice = 10;
var axe2FoodPrice = 10;
var spearWoodPrice = 130;
var foodWoodPrice = 100;
var villagerFoodPrice = 20;
var houseWoodPrice = 600;
var houseIronPrice = 100;
var lumberMillWoodPrice = 500;
var lumberMillIronPrice = 100;
var mineWoodPrice = 500;
var mineIronPrice = 150;
var huntingLodgeWoodPrice = 800;
var huntingLodgeIronPrice = 200;
var trainingYardWoodPrice = 1000;
var trainingYardIronPrice = 250;

// Training Stats - Borde kanske flyttas ihop med andra bars
var speed = 100; 
var strength = 100;
var cardio = 100;
var speedInc = 10;
var strengthInc = 10;
var cardioInc = 50;
var speedSpeed = 50000;
var strengthSpeed = 50000;
var cardioSpeed = 50000;
var trainingSpeedEnergyCost = 0.25;
var trainingStrengthEnergyCost = 0.5;
var trainingCardioEnergyCost = 0;
var trainingSpeedEnergyReq = 100;
var trainingStrengthEnergyReq = 100;
var trainingCardioEnergyReq = 100;

// Shop increments - hur mycket shop items ska ge (om de inte är med här ger de antagligen endast 1 item)
var foodShopInc = 10;
var houseShopInc = 8;

// Jobs
var unemployed = 0;
var woodCutter = 0;
var ironWorker = 0;
var hunter = 0;

// Images
var imgHouse;
var imgVillager;
var	imgHunter; 
var	imgLumberMill; 
var	imgMine; 
var	imgHuntingLodge; 
var	imgTrainingYard; 
var	imgTree; 


var imgXStart = 0;
var houseXImg = 0;
var houseYImg = 40;
var villagerXImg = 0;
var villagerYImg = 70;
var lumberMillYImg = 100;
var mineYImg = 130;
var huntingLodgeYImg = 160;
var hunterYImg = 160;
var trainingYardYImg = 190;
var treeYImg = 10;

