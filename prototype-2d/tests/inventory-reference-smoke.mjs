import assert from "node:assert/strict";
import { bootPage } from "./loot-smoke.mjs";

const plain = value => JSON.parse(JSON.stringify(value));
function game() {
  const page = bootPage(); page.start(); const d = page.debug;
  d.state.godMode = true; d.state.density = 0; d.state.enemies = [];
  d.state.lootTimer = Infinity; d.state.hordeTimer = Infinity; d.state.spawnBudget = 0;
  return { page, d };
}
function select(d, item, area = "bag") { d.state.bagSelection = item.id; d.state.selectionArea = area; }
function invariant(d, items, columns, capacity) {
  const occupied = new Set();
  for (const item of items.filter(e => !e.claimed)) {
    const data = d.supplyItems[item.itemId], width = item.rotated ? data.height : data.width, height = item.rotated ? data.width : data.height;
    assert(item.slot >= 0 && item.slot % columns + width <= columns);
    assert(Math.floor(item.slot / columns) + height <= capacity / columns);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const cell = item.slot + y * columns + x;
      assert(!occupied.has(cell), `overlap at cell ${cell}`); occupied.add(cell);
    }
  }
}
function quantities(d) {
  const result = {};
  for (const item of [...d.bag, ...d.state.safe]) result[item.itemId] = (result[item.itemId] || 0) + (d.supplyItems[item.itemId].category === "ammo" ? item.amount : item.count);
  return result;
}

export function runInventoryReferenceChecks() {
  const { d } = game();
  assert.equal(d.config.bagCapacity, 40); assert.equal(d.config.safeCapacity, 9);
  assert.equal(d.supplyItems.basketball.width, 2); assert.equal(d.supplyItems.basketball.height, 2);
  assert.equal(d.supplyItems.vacuum.height, 3); assert.equal(d.supplyItems.scar.width, 2);
  assert.equal(d.supplyItems.chess.width * d.supplyItems.chess.height, 4);
  const qualityBox = { id: "reference-quality", lootType: "travel", contents: [{ itemId: "basketball", quality: "legendary" }] };
  assert(d.searchSupplyBox(qualityBox));
  assert.equal(qualityBox.entries[0].quality, "legendary");
  assert.equal(qualityBox.entries[0].revealAt, 3.2, "search delay follows the revealed quality override");
  d.closeSearchWindow();
  for (const type of ["travel", "equipment", "tool", "safe"]) {
    const box = { id: `reference-${type}`, lootType: type };
    assert(d.searchSupplyBox(box));
    assert(box.entries.length >= 2); invariant(d, box.entries, box.columns, box.columns * box.rows);
    assert(!d.takeSearchItem(0));
    if (type === "safe") {
      d.step(1); assert.equal(box.elapsed, 0, "locked safe cannot identify loot");
      box.lock.elapsed = 0; assert(!d.confirmLock());
      for (let i = 0; i < 4; i++) { box.lock.elapsed = .7; assert(d.confirmLock()); }
      assert(box.lock.open);
    }
    d.step(20); assert(d.takeSearchItem(0)); assert(!d.takeSearchItem(0));
    d.toggleBagPanel(false); const before = box.elapsed; d.step(1); assert.equal(box.elapsed, before);
  }
  console.log("PASS typed containers fit their real grids; locked safe, sequential reveal and once-only claim");

  const shape = game().d;
  for (const itemId of ["basketball", "vacuum", "scar"]) assert(shape.carrySupply({ itemId }));
  const beforeBad = JSON.stringify(shape.bag);
  assert(!shape.reorderBag(0, 4)); assert(!shape.reorderBag(0, 36));
  assert.equal(JSON.stringify(shape.bag), beforeBad, "out-of-bounds 2D moves are atomic");
  assert(shape.reorderBag(1, 7), "tall item may overlap only its own former cells");
  for (const item of [...shape.bag]) assert(shape.transferInventory("bag", item.id, "safe"));
  invariant(shape, shape.state.safe, 3, 9); assert.equal(shape.bag.length, 0);
  assert(shape.carrySupply({ itemId: "cards" }));
  assert(!shape.transferInventory("bag", shape.bag[0].id, "safe"), "full safe rejects without deleting source");
  assert.equal(shape.bag.length, 1);
  const vacuum = shape.state.safe.find(e => e.itemId === "vacuum"); select(shape, vacuum, "safe");
  assert(!shape.rotateBagItem(), "rotation cannot cross safe-case border");
  assert(shape.transferInventory("safe", vacuum.id, "bag")); select(shape, shape.bag.find(e => e.id === vacuum.id));
  assert(shape.rotateBagItem()); invariant(shape, shape.bag, 5, 40);
  const beforeSort = quantities(shape); assert(shape.organizeBag()); assert.deepEqual(quantities(shape), beforeSort);
  console.log("PASS 2D placement, border rejection, cross-grid transfers, rotation and organizing conserve every item");

  const stacks = game().d; stacks.state.bagCapacity = 5;
  assert(stacks.carrySupply({ itemId: "lightAmmo", amount: 290 }));
  for (let i = 0; i < 4; i++) assert(stacks.carrySupply({ itemId: "junk" }));
  assert(!stacks.carrySupply({ itemId: "lightAmmo", amount: 20 }));
  assert.equal(stacks.bag[0].amount, 290, "failed partial merge leaves original stack unchanged");
  assert(stacks.carrySupply({ itemId: "lightAmmo", amount: 10 })); assert.equal(stacks.bag[0].amount, 300);
  stacks.state.bagCapacity = 10; select(stacks, stacks.bag[0]);
  assert(stacks.splitBagItem()); assert.deepEqual(plain(stacks.bag.filter(i => i.itemId === "lightAmmo").map(i => i.amount)), [150, 150]);
  const beforeMerge = quantities(stacks); assert(stacks.organizeBag()); assert.deepEqual(quantities(stacks), beforeMerge);
  assert.equal(stacks.bag.filter(i => i.itemId === "lightAmmo").length, 1);
  assert(stacks.dropBagItem(stacks.bag.findIndex(i => i.itemId === "lightAmmo")));
  const dropped = stacks.loot.find(i => i.droppedFromBag); assert.equal(dropped.amount, 300);
  assert.equal(stacks.tryCollectLoot(dropped.id), false);
  console.log("PASS stack caps, atomic full-grid merges, split/merge conservation and discard quantities");

  const gear = game().d;
  const original = { ...gear.state.weapon }; gear.state.weapon.ammoInMag = 7; gear.state.weapon.ammoReserve = 32;
  assert(gear.carrySupply({ itemId: "scar" })); assert(gear.useBagItem(0)); assert.equal(gear.state.weapon.id, "scar");
  const stowed = gear.bag.find(i => i.itemId === original.id); assert.equal(stowed.weaponState.ammoInMag, 7); assert.equal(stowed.weaponState.ammoReserve, 32);
  assert(gear.useBagItem(gear.bag.indexOf(stowed))); assert.equal(gear.state.weapon.ammoInMag, 7); assert.equal(gear.state.weapon.ammoReserve, 32);
  assert(gear.carrySupply({ itemId: "trainingHelmet" })); const reduction = gear.modifiers.damageReduction;
  assert(gear.useBagItem(gear.bag.findIndex(i => i.itemId === "trainingHelmet"))); assert(gear.modifiers.damageReduction > reduction);
  assert(gear.unequipItem("helmet")); assert.equal(gear.modifiers.damageReduction, reduction);
  gear.state.weapon.ammoInMag = 0; gear.state.weapon.ammoReserve = 0;
  gear.carrySupply({ itemId: "shells", amount: 12 }); gear.carrySupply({ itemId: "lightAmmo", amount: 50 });
  assert(gear.reloadWeapon()); assert.equal(gear.state.weapon.ammoInMag, 30);
  assert.equal(gear.bag.find(i => i.itemId === "lightAmmo").amount, 20); assert.equal(gear.bag.find(i => i.itemId === "shells").amount, 12);
  assert(!gear.useBagItem(gear.bag.findIndex(i => i.itemId === "shells")), "wrong caliber is never consumed");
  console.log("PASS searched gun swaps preserve ammunition; equipment affects combat; reload consumes matching bag ammo only");

  const smaller = game().d;
  for (let i = 0; i < 35; i++) smaller.carrySupply({ itemId: "junk" });
  smaller.carrySupply({ itemId: "fieldPack" }); const beforePack = JSON.stringify(smaller.bag);
  assert(!smaller.useBagItem(35)); assert.equal(JSON.stringify(smaller.bag), beforePack); assert.equal(smaller.state.bagCapacity, 40);
  const protectedRun = game(); const safe = protectedRun.d;
  safe.carrySupply({ itemId: "necklace" }); safe.transferInventory("bag", safe.bag[0].id, "safe"); safe.carrySupply({ itemId: "cards" });
  const protectedItems = plain(safe.state.safe);
  safe.state.godMode = false; safe.state.player.invulnerable = 0; safe.takeDamage(9999);
  assert.equal(safe.bag.length, 0); assert.deepEqual(plain(safe.state.extractedLoot), protectedItems);
  const frozen = JSON.stringify(safe.state.safe); assert(!safe.transferInventory("safe", safe.state.safe[0].id, "bag")); assert.equal(JSON.stringify(safe.state.safe), frozen);
  protectedRun.page.click("restartRun"); assert.equal(safe.state.safe.length, 0, "a new independent run never duplicates previous protected loot");
  console.log("PASS smaller-pack rollback, safe-case defeat protection and frozen-result guard");
  return { referenceInventory: true };
}
if (process.argv[1]?.endsWith("inventory-reference-smoke.mjs")) runInventoryReferenceChecks();
