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


def claim_resource_cache(floor, verbose=True):
    """真实走到秘藏补给箱并按 F，拿到 0.8.65 的 +2 药水。

    只读 snapshot 的 tacticalPoints（0.8.69 新字段），不硬编码坐标；
    已经领过就跳过。返回是否本次新领到。
    """
    s = snapshot()
    key = f"abyss-F{floor}"
    if s["progress"].get(key, {}).get("resourceClaimed"):
        return False
    point = next((p for p in s.get("tacticalPoints", []) if p.get("kind") == "resource"), None)
    if not point:
        if verbose:
            print(f"F{floor} 未找到秘藏补给箱点位，跳过", flush=True)
        return False
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
        print(f"F{floor} 补给箱 {'已领取' if ok else '领取失败'} 药水 {s['player']['potion']} 金币 {s['player']['gold']}", flush=True)
    return ok


def record_floor_deaths(floor, start_deaths, elapsed, s):
    """把本层死亡诊断追加到 JSONL；diagnostics 在 loadMap 后会重置，必须先存。"""
    p = s["player"]
    entry = {
        "at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "floor": floor,
        "elapsed": elapsed,
        "deathsStart": start_deaths,
        "deathsEnd": p["deaths"],
        "deathsDelta": p["deaths"] - start_deaths,
        "diagnostics": s.get("diagnostics"),
    }
    DEATH_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with DEATH_LOG_PATH.open("a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")


def clear_current_floor(floor, verbose=True):
    """清当前层：先 5 只普通怪，再回响；死亡后自动从安全营地继续。"""
    key = f"abyss-F{floor}"
    deaths = rp.player()["deaths"]
    start_deaths = deaths
    t0 = time.time()
    # 普通怪阶段
    for guard in range(45):
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
        pool = [e for e in s["entities"] if e.get("alive") and not e.get("boss")]
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

    # 0.8.69：小怪清完后先开秘藏补给箱，再打回响；补给箱是 F31+ 的主要药水来源。
    claim_resource_cache(floor, verbose)

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

    s = snapshot()
    elapsed = round(time.time() - t0, 1)
    print(f"F{floor} 完成：{json.dumps(s['progress'].get(key, {}), ensure_ascii=False)} 用时 {elapsed}s", flush=True)
    record_floor_deaths(floor, start_deaths, elapsed, s)
    save_raw()
    return s["progress"].get(key, {})


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--start", type=int, default=3)
    ap.add_argument("--end", type=int, default=10)
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
        pr = clear_current_floor(target)
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
