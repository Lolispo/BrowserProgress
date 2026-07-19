// Author Petter Andersson
"use strict"

// ===========================================================================
// Sprite manifest — the single source of truth for on-map art.
//
// Adding a sprite is ONE line here: `key: { src: "images/foo.svg" }`. The scene
// loads every entry into an Image (see scene.loadAssets) and looks buildings up
// by their type name, so a new building's art needs no other code.
//
// `src` can be a .png, a .svg, or an inline `data:` URI — the canvas rasterises
// all three at the size they're drawn, so SVG "just works" and stays crisp when
// scaled (unlike the fixed-resolution PNGs). Convention: a building's key equals
// its `type` (see buildingConfig / SHOP_ITEMS), so buildingImg(type) resolves here.
// ===========================================================================
var SPRITES = {
	// Actors + scenery
	villager:     { src: "images/villager.png" },
	tree:         { src: "images/tree.png" },

	// Home buildings (raster art)
	house:        { src: "images/house.png" },
	lumberMill:   { src: "images/lumberMill.png" },
	mine:         { src: "images/mine.png" },
	huntingLodge: { src: "images/huntingLodge.png" },
	trainingYard: { src: "images/trainingYard.png" },

	// Phase-3 buildings (vector SVG art — previously lettered placeholder boxes)
	quarry:       { src: "images/quarry.svg" },
	farm:         { src: "images/farm.svg" },
	blacksmith:   { src: "images/blacksmith.svg" },
	market:       { src: "images/market.svg" },
	monument:     { src: "images/monument.svg" },
};
