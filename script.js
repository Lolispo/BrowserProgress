// Author Petter Andersson
"use strict"

/*

	Kolla att det funkar bra:
		Hunting:
			Sätt en success rate på hunting som bestäms av strength o speed
			Höj hur mycket energi man förlorar på att jaga -> borde vara random mellan typ 0.4 och 0.75
				Kolla hur det är nu
		TrainingYard (func) - Kolla om det funkar
			Kontrollera att speed fungerar rätt
			
		Gör woodSpeed, ironSpeed etc beroende på speed o strength
				Kolla hur det funkar - balanserat? märker man skillnad?

	Fixes:
		GÖR:

		Css:
			MOVE all style to .css
				Har endast kvar width saker eftersom just nu är layout beroende av att width skriver över col-md-4 saker - Fixa sen
			Fixa durability bar css alignment		
			Fixa css för jobs
			.css nere till höger går för långt - Fixa sen
		Städa:

		Gör bättre:
			Energi: ska det påverka alla bars?
				typ 0.85 på wood o iron men typ 0.1 i req - osäker på den
			Nåt sätt så att canvas width inte är hårdkodad (!) just nu är den 1150px
					Kanske är ok for now, med tanke på vad gamet har för context
					Om man ändrade sizen i html så ändrades storleken, medan skalan på pixlarna var css size			

	Gameplay:
		Small: 
			Fixa så alternativa sättet att köpa axe (10 food) kommer när man kan trada senare istället
			se till att resources gathered baserat på strength blir fixed avrundade utan decimaler!
			Hover Funktionalitet! (mer detaljer i big)
			Dölj mer grejer när de inte är available, visa t.ex. inte jobs alls förrän man har första villagern!
			Färger på bars according to om man kan köpa / göra (har required shit)
				Bra sätt att få det synkat när spear och axe påverkas
				Shop items greyed out om man inte har råd
				Även mainShop knapparna ska ändra färg om de har något item i sig som man har råd med

			Ersätt alla resources med images istället
				Shop namnen är just nu för långa (bilder istället skulle fixa detta)
			Lägg till att det står hur många av de nya husen man har överallt, ex, lumberMill: 1 nånstans i interfacet
			Låt items vara osynliga i shoppen tills man har halva pengarna för dem, sen alltid synliga.
			Just nu: man borde bara kunna bygga en av varje special building
				Alternativt: sätt cap på hur många som kan jobba i varje lumberMill etc. Om man köpa fler -> kan man sätta ut fler
					Borde då bara visa att man kan köpa en till lumberMill när ens nuvarande lumberMill är över hälften av spotsen used
					^skulle motverka att man bara hordar varje hus MEN skulle kunna ses som en dryg aspect
			Snyggare animation när yxorna skadas
				ex. från 100 går blå bar till 95, sen fylls 5% till höger ut med rött som tickar ned till 95 gränsen också

		Balance:
			Fixa nåt för early game så man inte blir helt fucked om man inte köper en axe i början
				ClawIron alternativ? så det alltid ska finnas en väg tillbaka?
					Roligt ord för att hacka med småsten?
			Är speedratio bra just nu? Sänka lite kanske eftersom man ska kunna träna upp speed sen
				Borde gå till 0.2 när man går ur developer (är 0.1 atm) TODODev

		Big:
			Map/Images: 
				Få msg:s och resources in på canvasen
				Mellanrum mellan images när det är flera av samma
				Images byta rad när de fyller ut (borde gå att beräkna)
					(width of screen - widthImage) / (width+mellanrum)  = Hur många som får plats på en rad
				Börja göra icons på allting så saker sätts ut
					Gör träd som sätts ut och sen växer tillbaka
						Kolla hur man tar bort utplacerade bilder
				Nåt sätt att inte ge begränsningar på gården. Röra kartan eller att den blir större (Röra kartan bättre)

				
			Shop:
				Gör om knappar i shopp så items du kan köpa på flera sätt blir bättre
				Lägg till information om shop bars etc på hover!
					Om man hoverar över jobs så ser man available jobs
						om inga jobs är available än -> säg att man behöver bygga nånting för att få jobs
			
			Jobs: Fixa kriterier för att köpa jobHus? ex. behövs 10 villagers för att göra blacksmith eller nåt
			

			Nya koncept: 

				Nya Hus: 
					Blacksmith, 
					Farm
					Köp Hög hus som ger typ 40 housing, kostar 2000 wood och 500 iron
					Trading Post -> kan komma personer från andra byar och trada coola grejer (kan ge chans för senare progress, generera gold)

				Ny Resource: 
					Gold. Genereras i trading post

				Hire Caravan:
					Cost: 5 villagers, 500 wood, 150 iron
					Caravanen genererar guld och ger POPUP att man kan köpa grejer för guld en gång varje 2 min
				Map:
					Placering av diverse images på kartan? Automatiskt?
					När villagers sätts till jobs -> animate villagern
				
				Röra en gubbe på kartan som kan gå runt, för att farma wood måste man gå till skog, etc
					Kolla om man kan referrera till en bild och sen flytta den lätt / ta bort när man ritar på canvas
				Lägg till audio för att choppa wood o sånt (kanske)


	Deluxe Fixas:
		Gör så att ens progress sparas (Localstorage html5)
		Gör så att det finns en reset knapp
			Kanske spara highscore/ Finish eller nåt så man har en anledning att spara		
 
 */


$(document).ready( function (){
	
	initValues();
	initBars();
	initShopButtons();
	initShopSpecs();
	initJobsButtons();
});

function initValues(){

	if(developer){
		wood += 100000;
		iron += 100000;
		food += 100000;
	}

	// Init values for resources, employees
	upd("wood", wood);
	upd("iron", iron);
	upd("food", food);
	upd("axe", axe);
	upd("spear", spear);
	upd("villagers", villagers);
	upd("houses", houses);
	upd("unemployed", unemployed);
	upd("woodCutter", woodCutter);
	upd("ironWorker", ironWorker);
	upd("hunter", hunter);

	// Init values for special bars
	axeUpdate(0);
	spearUpdate(0);
	energyUpdate();
	setNewEnergyInc(); // init energyInc to cardio / 200.0;

	document.getElementById("shopName").innerHTML = "Shop - Main"

	// Init canvas and corresponding images
	var c = document.getElementById("canvas1");
	ctx = c.getContext("2d");

	imgHouse = document.getElementById("imgHouse");
	imgVillager = document.getElementById("imgVillager");
	imgHunter = document.getElementById("imgHunter");
	imgLumberMill = document.getElementById("imgLumberMill");
	imgMine = document.getElementById("imgMine");
	imgHuntingLodge = document.getElementById("imgHuntingLodge");
	imgTrainingYard = document.getElementById("imgTrainingYard");
	imgTree = document.getElementById("imgTree");

	// Init Green canvas background, should perhaps use other method
	ctx.fillStyle = "#00FF00"; 
	ctx.fillRect(0,0,c.width,c.height);

	var image = imgTree;

	for(var i = 0; imgXStart + ((image.width + image.width/5) * i) < c.width; i++){
		ctx.drawImage(image, imgXStart + ((image.width + image.width/5) * i), treeYImg); 
	}
	
	/*
	ctx.strokeStyle = "#555555";
	for(var i = 0; i < c.width; i += 20){
		ctx.moveTo(i, 0);
		ctx.lineTo(i, c.height);
		ctx.stroke();
//		ctx.drawLine(i, 0, i, c.height);
	}
	for(var i = 0; i < c.height; i += 20){
		ctx.moveTo(0, i);
		ctx.lineTo(c.width, i);
		ctx.stroke();
//		ctx.drawLine(0, i, c.width, i);
	}
	*/
}

function upd(variable, stringVar){
	document.getElementById(variable).innerHTML = stringVar;
}

function newMsg(msg){
	document.getElementById("3rdMsg").innerHTML = document.getElementById("prevMsg").innerHTML;
	document.getElementById("prevMsg").innerHTML = document.getElementById("printText").innerHTML;
	document.getElementById("printText").innerHTML = msg;
	console.log(msg);
}

function axeUpdate(percCost){
	var text = "";
	if(axe == 0){
		text = "No Axe Available";
	}else{
		if(axeDurability - percCost <= 0){
			axe--;
			document.getElementById("axe").innerHTML = "Axe: " + axe;
			newMsg("Axe broke!");
			axeDurability = 100;
			if(axe != 0){
				axeDurability -= percCost;
				text = "Axe Durability " + axeDurability + "%";
			}else{
				text = "No Axe Available";
				$('#axeDurabilityBar_innertext').toggleClass("innerTextRed", true);
				newMsg("Out of Axes!");
			}
		}else{
			axeDurability -= percCost;
			text = "Axe Durability " + axeDurability + "%";
		}		
	}
	$('#axeDurabilityBar_innerdiv').css("width", axeDurability + "%");
	$('#axeDurabilityBar_innertext').text(text);
}	

function spearUpdate(percCost){
	var text = "";
	if(spear == 0){
		text = "No Spear Available";
	}else{
		if(spearDurability - percCost <= 0){
			spear--;
			document.getElementById("spear").innerHTML = "Spear: " + spear;
			newMsg("Spear broke!");
			spearDurability = 100;
			if(spear != 0){
				spearDurability -= percCost;
				text = "Spear Durability " + spearDurability + "%";
			}else{
				text = "No Spear Available";
				$('#spearDurabilityBar_innertext').toggleClass("innerTextRed", true);
				newMsg("Out of Spears!");
			}
		}else{
			spearDurability -= percCost;
			text = "Spear Durability " + spearDurability + "%";
		}		
	}
	$('#spearDurabilityBar_innerdiv').css("width", spearDurability + "%");
	$('#spearDurabilityBar_innertext').text(text);
}

