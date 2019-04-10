
// Engelskan funkar endast om plural använder ett 's' efter
// Parametrar: axe, "Axe", "axe", axeDurability, axeDurability, percCost
// NOT WORKING MOVE AWAY
/*
function specBarUpdate(amountOfItems, itemName, itemID, itemDurability, itemDurBarName, percCost){
	var text = "";
	var items = eval(amountOfItems);
	var itemDur = eval(itemDurability);
	if(items == 0){
		text = "No " + itemName + " Available";
	}else{
		if(itemDur - percCost <= 0){
			items--;
			document.getElementById(itemID).innerHTML = itemName + ": " + items;
			newMsg(itemName + " broke!");
			itemDur = 100;
			if(items != 0){
				itemDur -= percCost;
				text = itemName + " Durability " + itemDur + "%";
			}else{
				text = "No " + itemName + " Available";
				newMsg("Out of " + itemName + "s!");
			}
		}else{
			console.log(items, itemDur, axe, axeDurability, percCost);
			itemDur -= percCost;
			text = itemName + " Durability " + itemDur + "%";
		}		
	}
	$('#' + itemDurBarName + 'Bar_innerdiv').css("width", axeDurability + "%");
	$('#' + itemDurBarName + 'Bar_innertext').text(text);
}

*/