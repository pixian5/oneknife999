# 真人输入驱动：只发送真实键鼠事件与读取只读快照，不注入战斗逻辑、不调用 strike。
import json
import time

import seed_browser_use as bu

MAP = {"KeyW": ("w", 87), "KeyA": ("a", 65), "KeyS": ("s", 83), "KeyD": ("d", 68)}
META = json.load(open("/home/user/repo-local/saves/route-meta.json", encoding="utf-8"))


def key_down(k):
    key, code = MAP[k]
    bu.cdp("Input.dispatchKeyEvent", type="keyDown", code=k, key=key,
           windowsVirtualKeyCode=code, nativeVirtualKeyCode=code)


def key_up(k):
    key, code = MAP[k]
    bu.cdp("Input.dispatchKeyEvent", type="keyUp", code=k, key=key,
           windowsVirtualKeyCode=code, nativeVirtualKeyCode=code)


def player():
    r = bu.cdp("Runtime.evaluate", expression="JSON.stringify(window.__ONEKNIFE_E2E__.snapshot().player)",
               returnByValue=True)
    return json.loads(r["result"]["value"])


def snap():
    r = bu.cdp("Runtime.evaluate", expression="JSON.stringify({s:window.__ONEKNIFE_E2E__.snapshot(),m:window.__ONEKNIFE_E2E__.meta(),r:(()=>{let q=document.querySelector('canvas').getBoundingClientRect();return{l:q.left,t:q.top,w:q.width,h:q.height}})()})",
               returnByValue=True)
    return json.loads(r["result"]["value"])


def step_key(k, sec):
    key_down(k)
    time.sleep(sec)
    key_up(k)
    time.sleep(0.03)


def move(tx, ty, tol=55, tries=14):
    """朝目标平移，遇到卡住就侧移绕一下。"""
    last = None
    stuck = 0
    for _ in range(tries):
        p = player()
        dx, dy = tx - p["x"], ty - p["y"]
        if abs(dx) < tol and abs(dy) < tol:
            return p
        if last is not None and abs(p["x"] - last[0]) + abs(p["y"] - last[1]) < 12:
            stuck += 1
        else:
            stuck = 0
        last = (p["x"], p["y"])
        if stuck >= 2:
            # 垂直方向侧移，绕开碰撞体
            if abs(dx) >= abs(dy):
                step_key("KeyS" if p["y"] > 700 else "KeyW", 0.28)
            else:
                step_key("KeyD" if p["x"] > 1200 else "KeyA", 0.28)
            stuck = 0
            continue
        if abs(dx) >= tol:
            step_key("KeyD" if dx > 0 else "KeyA", min(0.8, max(0.08, abs(dx) / 250)))
        if abs(dy) >= tol:
            step_key("KeyS" if dy > 0 else "KeyW", min(0.8, max(0.08, abs(dy) / 250)))
    return player()


def walk_path(points, tol=58):
    for x, y in points:
        move(x, y, tol)


def click_ent(e, o):
    cam, vs, rct = o["m"]["camera"], o["m"]["viewScale"], o["r"]
    sx = rct["l"] + (e["x"] - cam["x"]) * vs
    sy = rct["t"] + (e["y"] - cam["y"]) * vs
    nx, ny = round(sx / 1920 * 1000), round(sy / 993 * 1000)
    if not (0 <= nx <= 1000 and 0 <= ny <= 1000):
        return False
    bu.click_xy(nx, ny)
    return True


def combo(n=2):
    """近战/道士连招；只在血量低于 35% 时喝一次药，避免低血量职业被误判成一直危险。"""
    for i in range(n):
        p = player()
        if p["hp"] < p["maxHp"] * 0.35 and p["potion"] > 0:
            bu.hotkey("q")
            time.sleep(0.18)
        for k in ["4", "3", "2", "1", "x", "x"]:
            bu.hotkey(k)
            time.sleep(0.09)


def shop_buy(n=18):
    bu.hotkey("f")
    time.sleep(0.3)
    r = bu.cdp("Runtime.evaluate", expression="JSON.stringify([...document.querySelectorAll('button')].map((b,i)=>({i,t:b.textContent.trim(),vis:!!(b.offsetWidth||b.offsetHeight)})).filter(x=>x.vis&&x.t.includes('金币')))",
               returnByValue=True)
    btns = json.loads(r["result"]["value"])
    if not btns:
        return False
    idx = [b for b in btns if b["t"].startswith("90")][0]["i"]
    n = min(n, int(player()["gold"] // 90))
    for _ in range(n):
        bu.cdp("Runtime.evaluate", expression=f"document.querySelectorAll('button')[{idx}].click()",
               returnByValue=True)
        time.sleep(0.06)
    bu.hotkey("f")
    time.sleep(0.15)
    return True


def retreat_from(b, dist=210):
    """远程职业被近身时反方向拉开，保持射程。"""
    p = player()
    dx, dy = p["x"] - b["x"], p["y"] - b["y"]
    if abs(dx) >= abs(dy):
        k = "KeyD" if dx > 0 else "KeyA"
        step_key(k, 0.5)
    else:
        k = "KeyS" if dy > 0 else "KeyW"
        step_key(k, 0.5)


def spend_points():
    """把可用技能点全部投到第一个技能（法师=雷矛术，战士=破甲斩）。"""
    if player()["skillPoints"] <= 0:
        return
    bu.cdp("Runtime.evaluate", expression="document.querySelector('#skillBtn').click()", returnByValue=True)
    time.sleep(0.25)
    for _ in range(8):
        if player()["skillPoints"] <= 0:
            break
        bu.cdp("Runtime.evaluate", expression="[...document.querySelectorAll('button')].filter(b=>b.offsetWidth&&b.textContent.includes('升级'))[0]?.click()",
               returnByValue=True)
        time.sleep(0.18)
    bu.cdp("Runtime.evaluate", expression="[...document.querySelectorAll('button')].filter(b=>b.offsetWidth&&b.textContent.trim()==='关闭').slice(-1)[0]?.click()",
           returnByValue=True)
    time.sleep(0.2)


def ranged_cycle(b):
    """远程职业单发风筝：一记技能 + 一记普攻，然后后撤。"""
    p = player()
    dx, dy = p["x"] - b["x"], p["y"] - b["y"]
    if abs(dx) + abs(dy) < 175:
        retreat_from(b)
    elif abs(dx) + abs(dy) > 260:
        move(b["x"], b["y"], tol=210)
    o = snap()
    bs = [e for e in o["s"]["entities"] if e.get("id") == b["id"] and e.get("alive")]
    if not bs:
        return
    click_ent(bs[0], o)
    time.sleep(0.05)
    bu.hotkey("1")
    time.sleep(0.4)
    bu.hotkey("x")
    time.sleep(0.75)
    if player()["hp"] < player()["maxHp"] * 0.5:
        bu.hotkey("q")
        time.sleep(0.18)
    retreat_from(bs[0], 200)


def meta_for(n):
    return next(m for m in META if m["n"] == n)


# 首领印记过渡套的槽位与名称；按“先武器、再生存件”的顺序兑换。
MARKS_SET = [
    ("weapon", "烬誓·过渡长锋"),
    ("armor", "烬誓·过渡胸甲"),
    ("helmet", "烬誓·过渡面甲"),
    ("neck", "烬誓·过渡颈环"),
    ("boots", "烬誓·过渡战靴"),
    ("belt", "烬誓·过渡束带"),
    ("medal", "烬誓·过渡勋章"),
    ("talisman", "烬誓·过渡玉佩"),
]


def _eval_json(expr):
    r = bu.cdp("Runtime.evaluate", expression=expr, returnByValue=True)
    v = r["result"]["value"]
    return json.loads(v) if isinstance(v, str) else v


def _save_raw():
    return json.loads(bu.cdp("Runtime.evaluate", expression="localStorage.getItem('oneknife999-prototype-save-v4')", returnByValue=True)["result"]["value"])


def _click_box(box):
    """把页面像素矩形中心换算成 0-1000 坐标，发真实鼠标点击。"""
    if not box or not box.get("width"):
        return False
    bu.click_xy(
        (box["x"] + box["width"] / 2) / 1920 * 1000,
        (box["y"] + box["height"] / 2) / 993 * 1000,
    )
    return True


def click_element(selector_js):
    """先滚到视口内，再按真实矩形点击，避免面板滚动后点到视口外。"""
    _eval_json(f"(function(){{const e={selector_js}; if(!e)return 'null'; e.scrollIntoView({{block:'center'}}); return JSON.stringify(e.getBoundingClientRect().toJSON());}})()")
    time.sleep(0.25)
    box = _eval_json(f"(function(){{const e={selector_js}; return e?JSON.stringify(e.getBoundingClientRect().toJSON()):'null';}})()")
    return _click_box(box)


def buy_marks_gear(meta):
    """在城镇用真实点击兑换缺失的 800 印记过渡装，并立即穿戴。

    只读 localStorage 判断已拥有；不满足 800 印记或八件齐全时直接返回。
    """
    eq = _save_raw().get("equipment", {})
    missing = [(slot, name) for slot, name in MARKS_SET if (eq.get(slot) or {}).get("id") != f"marks-{slot}"]
    if not missing or player()["marks"] < 800:
        return False
    print("GEAR", "missing", [s for s, _ in missing], "marks", player()["marks"], flush=True)
    move(*meta["t"], tol=50)
    if not _eval_json("(function(){return !!document.querySelector('[data-buy-marks]');})()"):
        bu.hotkey("f")
        time.sleep(0.5)
    bought = []
    for slot, name in missing:
        if player()["marks"] < 800:
            break
        _eval_json(f"(function(){{const e=document.querySelector('button[data-buy-marks=\"{slot}\"]'); if(!e||e.disabled)return 'null'; e.scrollIntoView({{block:'center'}}); return JSON.stringify(e.getBoundingClientRect().toJSON());}})()")
        time.sleep(0.2)
        box = _eval_json(f"(function(){{const e=document.querySelector('button[data-buy-marks=\"{slot}\"]'); return e?JSON.stringify(e.getBoundingClientRect().toJSON()):'null';}})()")
        if not _click_box(box):
            continue
        time.sleep(0.4)
        print("GEAR", slot, name, "marks->", player()["marks"], flush=True)
        bought.append((slot, name))
    bu.hotkey("f")
    time.sleep(0.3)
    if not bought:
        return False
    # 打开背包：若网格高度为 0 则真实点击背包标题。
    if not _eval_json("(function(){const e=document.querySelector('#inventoryGrid');return !!(e&&e.getBoundingClientRect().height>0);})()"):
        click_element("document.querySelector('#inventoryHint')")
        time.sleep(0.3)
    for slot, name in bought:
        if (_save_raw().get("equipment", {}).get(slot) or {}).get("id") == f"marks-{slot}":
            continue
        _eval_json(f"(function(){{const e=[...document.querySelectorAll('#inventoryGrid .inventory-slot')].find(x=>x.title.includes('{name}')); if(!e)return 'null'; e.scrollIntoView({{block:'center'}}); return JSON.stringify(e.getBoundingClientRect().toJSON());}})()")
        time.sleep(0.2)
        box = _eval_json(f"(function(){{const e=[...document.querySelectorAll('#inventoryGrid .inventory-slot')].find(x=>x.title.includes('{name}')); return e?JSON.stringify(e.getBoundingClientRect().toJSON()):'null';}})()")
        _click_box(box)
        time.sleep(0.35)
        now = (_save_raw().get("equipment", {}).get(slot) or {})
        print("EQUIP", slot, now.get("name"), flush=True)
    click_element("document.querySelector('#inventoryHint')")
    time.sleep(0.2)
    return True



def save_checkpoint(n):
    r = bu.cdp("Runtime.evaluate", expression="JSON.stringify({s:window.__ONEKNIFE_E2E__.snapshot(),raw:localStorage.getItem('oneknife999-prototype-save-v4')})",
               returnByValue=True)
    o = json.loads(r["result"]["value"])
    open("/home/user/repo-local/saves/real-player-progress.json", "w", encoding="utf-8").write(o["raw"])
    return o["s"]


def clear_stage(n, verbose=True):
    cur = snap()["s"]["stageNumber"]
    if cur != n:
        raise RuntimeError(f"当前在第 {cur} 关，不能清第 {n} 关")
    meta = meta_for(n)
    cls = snap()["s"]["classId"]
    # 远程职业保持射程，近战贴脸
    engage = 200 if cls == "mage" else 170 if cls == "taoist" else 58
    deaths = player()["deaths"]
    spend_points()
    buy_marks_gear(meta)
    if player()["potion"] < 10 and player()["gold"] >= 90:
        move(*meta["t"])
        shop_buy(18)
    # 沿主路推进到首领方向，途中优先击杀最近的存活小怪
    progress_key = {1: "ash_outskirts", 2: "pine_forest", 3: "black_rock_mine", 4: "red_sand_desert"}.get(n, "stage_%03d" % n)
    guard = 0
    t0 = time.time()
    while guard < 40 and time.time() - t0 < 230:
        guard += 1
        o = snap()
        pr = o["s"]["progress"].get(progress_key, {})
        p = o["s"]["player"]
        if verbose:
            print(n, "kills", pr.get("kills"), "hp", p["hp"], "pot", p["potion"], "deaths", p["deaths"])
        if pr.get("kills", 0) >= pr.get("need", 6):
            break
        if p["deaths"] != deaths:
            deaths = p["deaths"]
            print(n, "死亡，回城补给后继续")
            if p["potion"] < 10 and p["gold"] >= 90:
                move(*meta["t"])
                shop_buy(18)
            continue
        pool = [e for e in o["s"]["entities"] if e.get("alive") and not e.get("boss")]
        if not pool:
            time.sleep(0.5)
            continue
        pool.sort(key=lambda e: (e["x"] - p["x"]) ** 2 + (e["y"] - p["y"]) ** 2)
        e = pool[0]
        move(e["x"], e["y"], tol=engage)
        o = snap()
        tgt = [z for z in o["s"]["entities"] if z.get("id") == e["id"] and z.get("alive")]
        if not tgt:
            continue
        click_ent(tgt[0], o)
        time.sleep(0.08)
        combo(3)
    # 首领
    while guard < 70 and time.time() - t0 < 240:
        guard += 1
        o = snap()
        pr = o["s"]["progress"].get(progress_key, {})
        p = o["s"]["player"]
        bs = [e for e in o["s"]["entities"] if e.get("boss")]
        if pr.get("bossDefeated"):
            break
        if p["deaths"] != deaths:
            deaths = p["deaths"]
            print(n, "首领战死亡，回城补给后继续")
            if p["potion"] < 10 and p["gold"] >= 90:
                move(*meta["t"])
                shop_buy(18)
            continue
        if not bs:
            time.sleep(0.4)
            continue
        b = bs[0]
        if verbose:
            print(n, "boss", b["name"], b["hp"], "php", p["hp"], "pos", round(p["x"]), round(p["y"]))
        move(b["x"], b["y"], tol=engage)
        o = snap()
        bs = [e for e in o["s"]["entities"] if e.get("boss")]
        if not bs:
            continue
        click_ent(bs[0], o)
        time.sleep(0.08)
        if cls == "mage":
            ranged_cycle(bs[0])
        else:
            combo(5)
            if cls == "taoist":
                p2 = player()
                dx, dy = p2["x"] - bs[0]["x"], p2["y"] - bs[0]["y"]
                if abs(dx) + abs(dy) < 150:
                    retreat_from(bs[0])
    bu.hotkey("f")
    time.sleep(0.3)
    s = save_checkpoint(n)
    return s["progress"].get(progress_key, {})


def next_stage():
    bu.hotkey("t")
    time.sleep(0.6)
    return snap()["s"]["stageNumber"]
