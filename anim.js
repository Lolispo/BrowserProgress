// Author Petter Andersson
"use strict"

// ===========================================================================
// Tiny animation toolkit: pure helpers the scene composes for motion + juice.
//
// Naming the primitives means a new effect is "oscillate + ease", not another
// block of inline trig in scene.draw(). Every time arg is in seconds (the scene
// passes now = lastTime/1000). Keep these pure + side-effect-free.
// ===========================================================================
var Anim = {
	// Signed sine wave — gentle bobs / sways. amp is the peak displacement.
	oscillate: function(t, freq, amp, phase){ return Math.sin(t * freq + (phase || 0)) * amp; },

	// 0..1 rectified sine — step "hops", blinks, throbs (never negative).
	pulse: function(t, freq, phase){ return Math.abs(Math.sin(t * freq + (phase || 0))); },

	// Linear interpolate a -> b by p.
	tween: function(a, b, p){ return a + (b - a) * p; },

	// Clamp to 0..1 (handy for progress values feeding an ease).
	clamp01: function(p){ return p < 0 ? 0 : p > 1 ? 1 : p; },

	// Easings (p in 0..1). Cubic for smooth arrivals; back for a little overshoot.
	easeOutCubic: function(p){ p = 1 - p; return 1 - p * p * p; },
	easeOutBack: function(p){ var c = 1.70158; p = p - 1; return 1 + (c + 1) * p * p * p + c * p * p; },
};
