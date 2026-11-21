"""无尽深层真人推进：只用真实键鼠事件清层、按 T 深入，并逐层落盘。

不调用 E2E strike / 不注入战斗数据；所有伤害来自真实点击锁定与键盘技能。
用法：python3 tools/run_abyss.py --start 3 --end 10
"""
import argparse
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import local_cdp  # noqa: E402

# real_play 顶层 import seed_browser_use；直连 CDP 时用 local_cdp 顶替。
sys.modules.setdefault("seed_browser_use", local_cdp)
import real_play as rp  # noqa: E402

SAVE_PATH = Path("/home/user/repo-local/saves/abyss-progress.json")


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


def clear_current_floor(floor, verbose=True):
    """清当前层：先 5 只普通怪，再回响；死亡后自动从安全营地继续。"""
    key = f"abyss-F{floor}"
    deaths = rp.player()["deaths"]
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
    save_raw()
    return s["progress"].get(key, {})


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--start", type=int, default=3)
    ap.add_argument("--end", type=int, default=10)
    args = ap.parse_args()
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
