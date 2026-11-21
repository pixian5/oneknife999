"""按真实键鼠事件连续推进指定关卡区间，并逐关落盘检查点。"""
import sys
import time

sys.path.insert(0, "/home/user/repo-local/tools")
import local_cdp

sys.modules["seed_browser_use"] = local_cdp
import real_play as rp


def key_of(n):
    return {1: "ash_outskirts", 2: "pine_forest", 3: "black_rock_mine", 4: "red_sand_desert"}.get(
        n, "stage_%03d" % n
    )


def main():
    start, end = int(sys.argv[1]), int(sys.argv[2])
    tag = sys.argv[3] if len(sys.argv) > 3 else "run"
    for n in range(start, end + 1):
        cur = rp.snap()["s"]["stageNumber"]
        if cur < n:
            print("TRAVEL", n, "from", cur, flush=True)
            rp.next_stage()
            time.sleep(1)
            cur = rp.snap()["s"]["stageNumber"]
        if cur != n:
            print("SKIP-OR-BLOCK", n, "cur", cur, flush=True)
            if cur > n:
                continue
            break
        done = rp.snap()["s"]["progress"].get(key_of(n), {}).get("completed")
        if done:
            print("ALREADY", n, flush=True)
            continue
        for attempt in range(3):
            print("STAGE", n, "attempt", attempt + 1, flush=True)
            rp.clear_stage(n)
            pr = rp.snap()["s"]["progress"].get(key_of(n), {})
            if pr.get("completed"):
                s = rp.save_checkpoint(n)
                cur = s["stageNumber"]
                open("/home/user/repo-local/saves/%s-progress.json" % tag, "w", encoding="utf-8").write(
                    open("/home/user/repo-local/saves/real-player-progress.json", encoding="utf-8").read()
                )
                p = s["player"]
                print(
                    "DONE",
                    n,
                    "stageNow",
                    cur,
                    "lv",
                    p["level"],
                    "hp",
                    p["hp"],
                    "/",
                    p["maxHp"],
                    "deaths",
                    p["deaths"],
                    "gold",
                    p["gold"],
                    "marks",
                    p["marks"],
                    flush=True,
                )
                break
            print("RETRY", n, "pr", pr, flush=True)
        else:
            print("FAILED", n, flush=True)
            break


main()
