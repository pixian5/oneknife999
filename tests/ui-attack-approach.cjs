// 0.8.47 回归：射程外点一次普攻后，角色自动接近并在进入射程时自动打一下；
// 到位后旧的“目标较远”提示必须消失，且正常键盘 X 仍能继续攻击。
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { browserLaunchOptions } = require("./browser-options.cjs");

const BASE_URL = process.env.ONEKNIFE_URL || "http://127.0.0.1:4174/?e2e=1";

(async () => {
  const browser = await chromium.launch(browserLaunchOptions());
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    await page.locator('[data-class="warrior"]').click();
    await page.waitForTimeout(250);

    const setup = await page.evaluate(async () => {
      const s = (await import("/src/runtime.js")).state;
      const entity = s.entities.find((item) => item.alive && !item.friendly && !item.npc && !item.boss);
      if (!entity) return null;
      // 放在目标右侧 150px：超过战士 70 射程，但在自动索敌 310 内。
      s.player.x = entity.x + 150;
      s.player.y = entity.y;
      s.player.hp = 99999;
      s.player.targetId = entity.id;
      s.player.autoAttackId = null;
      await new Promise((resolve) => setTimeout(resolve, 120));
      return { id: entity.id, name: entity.name, hp: entity.hp };
    });
    assert.ok(setup, "第 1 关没有普通怪");
    await page.waitForTimeout(100);

    await page.locator("#normalAttackBtn").click();
    await page.waitForTimeout(120);
    const started = await page.evaluate(() => {
      const snap = window.__ONEKNIFE_E2E__.snapshot();
      return {
        targetId: snap.player.targetId,
        autoAttackId: snap.player.autoAttackId,
        hint: document.querySelector("#targetHint").textContent
      };
    });
    assert.equal(started.targetId, setup.id, "射程外点普攻没有保持目标");
    assert.equal(started.autoAttackId, setup.id, "射程外点普攻没有记录自动接近意图");
    assert.match(started.hint, /超射程 70 · 自动接近中/, `目标栏缺少自动接近标识：${started.hint}`);

    await page.waitForTimeout(2200);
    const arrived = await page.evaluate((id) => {
      const snap = window.__ONEKNIFE_E2E__.snapshot();
      const entity = snap.entities.find((item) => item.id === id);
      return {
        hp: entity?.hp ?? 0,
        autoAttackId: snap.player.autoAttackId,
        hint: document.querySelector("#targetHint").textContent
      };
    }, setup.id);
    assert.ok(arrived.hp < setup.hp, `自动接近后没有出手：${setup.hp} → ${arrived.hp}`);
    assert.equal(arrived.autoAttackId, null, "自动攻击完成后意图应清空");
    // 命中后怪物可能被击退/走位到 70 外，这里只要求自动接近意图已结束，不能继续显示“自动接近中”。
    assert.doesNotMatch(arrived.hint, /自动接近中/, `自动攻击结束后仍在显示自动接近：${arrived.hint}`);

    // 等待普攻冷却结束后，真实键盘 X 仍应造成伤害。
    await page.waitForTimeout(1100);
    const hpBeforeKey = await page.evaluate(
      (id) => window.__ONEKNIFE_E2E__.snapshot().entities.find((item) => item.id === id).hp,
      setup.id
    );
    await page.keyboard.press("x");
    await page.waitForTimeout(260);
    const hpAfterKey = await page.evaluate((id) => window.__ONEKNIFE_E2E__.snapshot().entities.find((item) => item.id === id).hp, setup.id);
    assert.ok(hpAfterKey < hpBeforeKey, `键盘 X 未造成伤害：${hpBeforeKey} → ${hpAfterKey}`);

    assert.deepEqual(errors, [], "自动接近测试期间页面异常");
    process.stdout.write("UI attack approach: PASS\n");
  } finally {
    await context.close();
    await browser.close();
  }
})();
