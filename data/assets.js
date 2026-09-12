// Author Petter Andersson
"use strict"

// ===========================================================================
// Sprite manifest — the single source of truth for on-map art.
//
// Adding a sprite is ONE line here: `key: { src: "images/foo.svg", w: 20, h: 20 }`.
// The 2D renderer loads every entry into an Image (see Render2D.loadAssets) and
// looks buildings up by their type name, so a new building's art needs no other
// code. The 3D renderer reads the same manifest for its billboard textures.
//
// `src` can be a .png, a .svg, or an inline `data:` URI — the canvas rasterises
// all three at the size they're drawn, so SVG "just works" and stays crisp when
// scaled (unlike the fixed-resolution PNGs). Convention: a building's key equals
// its `type` (see buildingConfig / SHOP_ITEMS), so buildingImg(type) resolves here.
//
// `w`/`h` are the art's intrinsic pixel size, DECLARED rather than read back off
// the loaded Image. The world sim needs footprints to lay buildings out and to
// park villagers at a door, and it must not depend on when a PNG happens to
// finish decoding — nor on there being a rasteriser at all, since the 3D
// renderer never creates an Image. scene.footprint() scales these by
// SPRITE_SCALE into world units. Keep them in sync with the files.
// ===========================================================================
var SPRITES = {
	// Actors + scenery
	villager:     { src: "images/villager.png",     w: 15, h: 20 },
	tree:         { src: "images/tree.png",         w: 20, h: 20 },

	// Home buildings (raster art)
	house:        { src: "images/house.png",        w: 20, h: 20 },
	lumberMill:   { src: "images/lumberMill.png",   w: 20, h: 20 },
	mine:         { src: "images/mine.png",         w: 20, h: 20 },
	huntingLodge: { src: "images/huntingLodge.png", w: 20, h: 20 },
	trainingYard: { src: "images/trainingYard.png", w: 20, h: 15 },

	// Phase-3 buildings (vector SVG art — previously lettered placeholder boxes)
	quarry:       { src: "images/quarry.svg",       w: 20, h: 20 },
	farm:         { src: "images/farm.svg",         w: 20, h: 20 },
	blacksmith:   { src: "images/blacksmith.svg",   w: 20, h: 20 },
	market:       { src: "images/market.svg",       w: 20, h: 20 },
	monument:     { src: "images/monument.svg",     w: 20, h: 20 },
};
