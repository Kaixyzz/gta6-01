// missions.js — the four story jobs of SOLARA BAY, in order. Each mission
// knows its title, its cash reward, where its marker sits, and what the
// player has to do. The game logic in game.js reads these; this file only
// describes the story.
(function () {
  'use strict';
  var SB = window.SB = window.SB || {};

  SB.MISSIONS = [
    {
      title: 'First Wheels',
      reward: 300,
      objective: 'Steal a car and drive it to the drop-off.',
      marker: { x: 640, y: 1280 },
      markerLabel: 'DROP-OFF'
    },
    {
      title: 'The Pickup',
      reward: 500,
      objective: 'Drive to the pickup point, grab the package, then deliver it.',
      marker: { x: 960, y: 640 },
      markerLabel: 'PICKUP',
      delivery: { x: 1920, y: 1280 },
      deliveryLabel: 'DELIVERY'
    },
    {
      title: 'Turfwars',
      reward: 800,
      objective: 'On foot: defeat the 4 gang members at the turf. Watch your ammo.',
      marker: { x: 1920, y: 960 },
      markerLabel: 'TURF'
    },
    {
      title: 'The Getaway',
      reward: 1500,
      objective: 'Grab the goods, then escape the police chase to the safehouse.',
      marker: { x: 1280, y: 640 },
      markerLabel: 'GOODS',
      safehouse: { x: 2240, y: 1600 },
      safehouseLabel: 'SAFEHOUSE'
    }
  ];

  // Where the pulsing marker points right now.
  SB.missionMarker = function (G) {
    var m = SB.MISSIONS[G.missionIndex];
    if (!m) return null;
    if (G.missionIndex === 1 && G.stage === 1) return m.delivery;
    if (G.missionIndex === 3 && G.stage === 1) return m.safehouse;
    return m.marker;
  };

  SB.missionMarkerLabel = function (G) {
    var m = SB.MISSIONS[G.missionIndex];
    if (!m) return '';
    if (G.missionIndex === 1 && G.stage === 1) return m.deliveryLabel;
    if (G.missionIndex === 3 && G.stage === 1) return m.safehouseLabel;
    return m.markerLabel;
  };

  // The objective line shown on the mission card, per stage.
  SB.missionObjective = function (G) {
    var m = SB.MISSIONS[G.missionIndex];
    if (!m) return '';
    if (G.missionIndex === 0) {
      return G.player.inCar
        ? 'Drive the stolen car to the drop-off.'
        : 'Steal a car (walk up to one and press E), then drive to the drop-off.';
    }
    if (G.missionIndex === 1) {
      return G.stage === 0
        ? 'Drive to the pickup point and collect the package.'
        : 'Package collected. Deliver it to the marked destination.';
    }
    if (G.missionIndex === 2) {
      if (G.enemies.length === 0 && G.kills < 4) return 'Get to the turf. The gang is waiting there.';
      return 'Defeat the gang members: ' + G.kills + ' of 4 down.';
    }
    if (G.missionIndex === 3) {
      return G.stage === 0
        ? 'Drive to the goods and grab them.'
        : 'Police chase! Lose them and reach the safehouse.';
    }
    return m.objective;
  };

  SB.missionTitle = function (G) {
    if (G.storyComplete) return 'Story Complete';
    var m = SB.MISSIONS[G.missionIndex];
    return m ? ('Mission ' + (G.missionIndex + 1) + '/4 — ' + m.title) : '';
  };
})();
