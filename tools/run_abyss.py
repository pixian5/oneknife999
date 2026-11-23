"""无尽深层真人推进：只用真实键鼠事件清层、按 T 深入，并逐层落盘。

不调用 E2E strike / 不注入战斗数据；所有伤害来自真实点击锁定与键盘技能。
用法：python3 tools/run_abyss.py --start 3 --end 10
"""
import argparse
import atexit
import json
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import local_cdp  # noqa: E402

# real_play 顶层 import seed_browser_use；直连 CDP 时用 local_cdp 顶替。
sys.modules.setdefault("seed_browser_use", local_cdp)
import real_play as rp  # noqa: E402

SAVE_PATH = Path("/home/user/repo-local/saves/abyss-progress.json")
# 0.8.68：单实例锁。此前误开两个 run_abyss 进程同时操作同一页面，
# 键盘/鼠标事件互相打断，日志重复且层数据失真。启动时占用锁，退出自动释放。
LOCK_PATH = Path("/home/user/repo-local/saves/.run_abyss.lock")
# 0.8.69：每层完成时把当层诊断落盘，按 T 进下一层后就看不到上一层死因了。
DEATH_LOG_PATH = Path("/home/user/repo-local/saves/abyss-floor-deaths.jsonl")


def _pid_alive(pid: int) -> bool:
    """判断锁里的进程是否仍存活。"""
    try:
        os.kill(pid, 0)
    except OSError:
        return False
    return True


def acquire_lock() -> None:
    """占用单实例锁；已有存活实例时拒绝启动。"""
    if LOCK_PATH.exists():
        try:
            old = int(LOCK_PATH.read_text(encoding="utf-8").strip())
        except ValueError:
            old = 0
        if old and old != os.getpid() and _pid_alive(old):
            raise SystemExit(f"已有 run_abyss 在运行（PID {old}），拒绝重复启动")
        LOCK_PATH.unlink(missing_ok=True)
    LOCK_PATH.write_text(str(os.getpid()), encoding="utf-8")

    def release():
        """仅删除自己持有的锁，避免误删后来实例的锁。"""
        try:
            if LOCK_PATH.read_text(encoding="utf-8").strip() == str(os.getpid()):
                LOCK_PATH.unlink(missing_ok=True)
        except OSError:
            pass

    atexit.register(release)


def snapshot():
    return rp.snap()["s"]


def save_raw():
    raw = local_cdp.cdp(
        "Runtime.evaluate",
        expression="localStorage.getItem('oneknife999-prototype-save-v4')",
        returnByValue=True,
    )["result"]["value"]
    SAVE_PATH.write_text(raw, encoding="utf-8")
    return raw


def save_manual():
    """点游戏内“保存”再读 localStorage。

    0.8.70：清层日志里的 HP 与 autoSave 落盘 HP 可能差一段自然回血；
    截图/存档要以手动保存后的值为准，否则 HUD 981、存档 600。
    """
    local_cdp.cdp(
        "Runtime.evaluate",
        expression="document.querySelector('#saveBtn')?.click(); 'clicked'",
        returnByValue=True,
    )
    time.sleep(0.5)
    return save_raw()


def press_t():
    local_cdp.cdp(
        "Input.dispatchKeyEvent",
        type="keyDown",
        key="t",
        code="KeyT",
        windowsVirtualKeyCode=84,
        nativeVirtualKeyCode=84,
    )
    local_cdp.cdp(
        "Input.dispatchKeyEvent",
        type="keyUp",
        key="t",
        code="KeyT",
        windowsVirtualKeyCode=84,
        nativeVirtualKeyCode=84,
    )


def claim_resource_cache(floor, cache_policy="all", verbose=True):
    """真实走到秘藏补给箱并按 F，拿到 0.8.65 的 +2 药水。

    只读 snapshot 的 tacticalPoints（0.8.69 新字段），不硬编码坐标；
    已经领过就跳过。cache_policy=main 时只开主线箱，跳过支路箱；
    返回 {claimed, route, name}，供逐层日志记录补给成本。
    """
    s = snapshot()
    key = f"abyss-F{floor}"
    if s["progress"].get(key, {}).get("resourceClaimed"):
        return {"claimed": False, "route": None, "name": None}
    if cache_policy == "none":
        return {"claimed": False, "route": None, "name": None}
    points = [p for p in s.get("tacticalPoints", []) if p.get("kind") == "resource"]
    if cache_policy == "main":
        points = [p for p in points if p.get("route", "main") == "main"]
    elif cache_policy == "main-first":
        # 0.8.71：有主线箱优先主线，没有主线箱时才退回支路。
        # 此前 main 策略在 F87–F90 连续四层“没有主线箱”，直接放弃 +2 药水。
        main_points = [p for p in points if p.get("route", "main") == "main"]
        points = main_points or points
    if not points:
        if verbose:
            print(f"F{floor} 未找到可开的秘藏补给箱（{cache_policy}），跳过", flush=True)
        return {"claimed": False, "route": None, "name": None}
    point = points[0]
    p = s["player"]
    if verbose:
        print(f"F{floor} 前往补给箱 {point['name']} ({point['x']},{point['y']}) 药水 {p['potion']}", flush=True)
    rp.move(point["x"], point["y"], tol=35)
    time.sleep(0.2)
    rp.bu.hotkey("f")
    time.sleep(0.8)
    s = snapshot()
    ok = bool(s["progress"].get(key, {}).get("resourceClaimed"))
    if not ok:
        # 落点被撞偏或距离差一点时，再靠近一次按 F；仍失败就交给后续战斗，不卡层。
        rp.move(point["x"], point["y"], tol=25)
        time.sleep(0.15)
        rp.bu.hotkey("f")
        time.sleep(0.8)
        s = snapshot()
        ok = bool(s["progress"].get(key, {}).get("resourceClaimed"))
    if verbose:
        print(f"F{floor} 补给箱 {'已领取' if ok else '领取失败'} 路线 {point.get('route', 'main')} 药水 {s['player']['potion']} 金币 {s['player']['gold']}", flush=True)
    return {"claimed": ok, "route": point.get("route", "main"), "name": point.get("name")}


def record_floor_deaths(floor, start_deaths, elapsed, s, start_hp, start_potion, cache, cache_timing):
    """把本层死亡、HP、药水、补给箱路线与开箱时机追加到 JSONL；diagnostics 在 loadMap 后会重置，必须先存。"""
    p = s["player"]
    entry = {
        "at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "floor": floor,
        "elapsed": elapsed,
        "hpStart": start_hp,
        "hpEnd": p["hp"],
        "potionStart": start_potion,
        "potionEnd": p["potion"],
        "deathsStart": start_deaths,
        "deathsEnd": p["deaths"],
        "deathsDelta": p["deaths"] - start_deaths,
        "cache": {**cache, "timing": cache_timing},
        "completed": bool(s["progress"].get(f"abyss-F{floor}", {}).get("completed")),
        "diagnostics": s.get("diagnostics"),
    }
    DEATH_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with DEATH_LOG_PATH.open("a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")


def clear_current_floor(floor, cache_policy="all", cache_timing="after-clear", verbose=True):
    """清当前层：先 5 只普通怪，再回响；死亡后自动从安全营地继续。"""
    key = f"abyss-F{floor}"
    start = rp.player()
    deaths = start["deaths"]
    start_deaths = deaths
    start_hp = start["hp"]
    start_potion = start["potion"]
    cache = {"claimed": False, "route": None, "name": None}
    t0 = time.time()
    # 0.8.70：entry 在清小怪之前开箱，避开清完后 28–45 秒重生的小怪；
    # 支路箱的守怪仍在，但不会叠加“清完 5 只后回头跑图”的二次风险。
    if cache_timing == "entry":
        cache = claim_resource_cache(floor, cache_policy, verbose)
    # 普通怪阶段：0.8.71 F90 只剩 2 只时 45 次循环耗尽，增加到 120 次；
    # 不把“回到营地”算作失败，死亡后继续找下一只。
    for guard in range(120):
        s = snapshot()
        pr = s["progress"].get(key, {})
        p = s["player"]
        if verbose:
            print(f"F{floor} 小怪 {pr.get('kills', 0)}/{pr.get('need', 5)} HP {p['hp']} 死亡 {p['deaths']}", flush=True)
        if pr.get("kills", 0) >= pr.get("need", 5):
            break
        if p["deaths"] != deaths:
            deaths = p["deaths"]
            print(f"F{floor} 死亡一次，回营地后继续", flush=True)
            continue
        # 0.8.71：不要锁定白名 NPC / 友军；F90 的流浪武者曾被当成普通怪。
        pool = [
            e for e in s["entities"]
            if e.get("alive") and not e.get("boss") and not e.get("npc") and not e.get("friendly")
        ]
        if not pool:
            time.sleep(0.5)
            continue
        pool.sort(key=lambda e: (e["x"] - p["x"]) ** 2 + (e["y"] - p["y"]) ** 2)
        e = pool[0]
        rp.move(e["x"], e["y"], tol=150)
        s = snapshot()
        tgt = [z for z in s["entities"] if z.get("id") == e["id"] and z.get("alive")]
        if not tgt:
            continue
        rp.click_ent(tgt[0], rp.snap())
        time.sleep(0.08)
        rp.combo(3)

    # 0.8.70：小怪清完后按 cache_policy 开秘藏补给箱；main 跳过有守怪的支路箱。
    if cache_timing == "after-clear":
        cache = claim_resource_cache(floor, cache_policy, verbose)

    # 首领阶段
    for guard in range(80):
        s = snapshot()
        pr = s["progress"].get(key, {})
        p = s["player"]
        boss = next((e for e in s["entities"] if e.get("boss")), None)
        if verbose:
            print(f"F{floor} 回响 {boss['hp'] if boss else None} 玩家HP {p['hp']} 死亡 {p['deaths']}", flush=True)
        if pr.get("bossDefeated"):
            break
        if p["deaths"] != deaths:
            deaths = p["deaths"]
            print(f"F{floor} 首领战死亡，回营地后继续", flush=True)
            continue
        if not boss:
            time.sleep(0.4)
            continue
        rp.move(boss["x"], boss["y"], tol=150)
        s = snapshot()
        boss = next((e for e in s["entities"] if e.get("boss")), None)
        if not boss:
            continue
        rp.click_ent(boss, rp.snap())
        time.sleep(0.08)
        rp.combo(5)

    # 0.8.70：打完 boss 再开箱，路线绝对安全，但药水只能留给下一层。
    if cache_timing == "after-boss" and not cache.get("claimed"):
        cache = claim_resource_cache(floor, cache_policy, verbose)

    s = snapshot()
    elapsed = round(time.time() - t0, 1)
    p = s["player"]
    print(f"F{floor} 完成：{json.dumps(s['progress'].get(key, {}), ensure_ascii=False)} 用时 {elapsed}s HP {start_hp}->{p['hp']} 药水 {start_potion}->{p['potion']} 死亡 {start_deaths}->{p['deaths']}", flush=True)
    record_floor_deaths(floor, start_deaths, elapsed, s, start_hp, start_potion, cache, cache_timing)
    # 0.8.70：清层完成先点“保存”，把自然回血后的 HP 落盘，避免 HUD 与存档不一致。
    save_manual()
    return s["progress"].get(key, {})


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--start", type=int, default=3)
    ap.add_argument("--end", type=int, default=10)
    ap.add_argument("--cache-policy", choices=["all", "main", "main-first", "none"], default="all",
                    help="all=开所有可开箱；main=只开主线箱；main-first=主线优先、无主线才开支路；none=不开箱")
    ap.add_argument("--cache-timing", choices=["entry", "after-clear", "after-boss"], default="after-clear",
                    help="entry=进层先开箱；after-clear=清完小怪开箱；after-boss=打完 boss 开箱")
    args = ap.parse_args()
    acquire_lock()
    s = snapshot()
    cur = s["currentMapId"]
    if not cur.startswith("abyss-F"):
        raise SystemExit(f"当前不在深层：{cur}")
    floor = int(cur.split("F")[1])
    if floor != args.start:
        raise SystemExit(f"存档在第 {floor} 层，与 --start {args.start} 不一致")
    for target in range(args.start, args.end + 1):
        s = snapshot()
        floor = int(s["currentMapId"].split("F")[1])
        if floor != target:
            raise SystemExit(f"期望 F{target}，实际 F{floor}")
        pr = clear_current_floor(target, args.cache_policy, args.cache_timing)
        if not pr.get("completed"):
            raise SystemExit(f"F{target} 未完成，停止")
        if target == args.end:
            break
        before = s["currentMapId"]
        press_t()
        time.sleep(2.5)
        after = snapshot()["currentMapId"]
        if after == before:
            raise SystemExit(f"F{target} 完成后按 T 未进入下一层：{after}")
        print(f"深入：{before} → {after}", flush=True)


if __name__ == "__main__":
    main()
