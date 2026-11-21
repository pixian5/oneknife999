"""直连 CDP（Chrome DevTools Protocol）真人输入桥。

用途：当 Browser Use 后端不可用时，仍只发送真实键鼠事件与读取只读快照，
不注入任何战斗逻辑，也不调用 strike 作弊接口。
"""
import json
import os
import time

import websocket

_port = os.environ.get("ONEKNIFE_CDP_PORT", "9222")
_VK = {
    "w": (87, "KeyW"),
    "a": (65, "KeyA"),
    "s": (83, "KeyS"),
    "d": (68, "KeyD"),
    "f": (70, "KeyF"),
    "t": (84, "KeyT"),
    "q": (81, "KeyQ"),
    "x": (88, "KeyX"),
    "1": (49, "Digit1"),
    "2": (50, "Digit2"),
    "3": (51, "Digit3"),
    "4": (52, "Digit4"),
}


def _target():
    """取当前游戏页面 target；没有就报错。"""
    import requests

    pages = requests.get(f"http://127.0.0.1:{_port}/json/list", timeout=5).json()
    for p in pages:
        if p.get("type") == "page" and "127.0.0.1:4174" in p.get("url", ""):
            return p["webSocketDebuggerUrl"]
    raise RuntimeError("找不到游戏页面")


def _conn():
    return websocket.create_connection(_target(), timeout=10, origin="http://127.0.0.1")


def cdp(method, **params):
    """发一条 CDP 命令，返回 result；兼容 BU 的 result 包装。"""
    ws = _conn()
    try:
        ws.send(json.dumps({"id": 1, "method": method, "params": params}))
        while True:
            msg = json.loads(ws.recv())
            if msg.get("id") == 1:
                if "error" in msg:
                    raise RuntimeError(f"CDP error: {msg['error']}")
                res = msg.get("result", {})
                # Runtime.evaluate 的返回值包在 result 里，摊平成 BU 的 {result:{value}}
                if isinstance(res.get("result"), dict):
                    res = res["result"]
                return {"result": res}
    finally:
        ws.close()


def _size():
    return 1920, 993


def click_xy(x, y):
    """按 0-1000 归一化坐标点击；与 Browser Use 保持一致。"""
    w, h = _size()
    px, py = round(x / 1000 * w), round(y / 1000 * h)
    for t in ("mousePressed", "mouseReleased"):
        cdp(
            "Input.dispatchMouseEvent",
            type=t,
            x=px,
            y=py,
            button="left",
            clickCount=1,
        )
    time.sleep(0.12)


def key_down(k):
    vk, code = _VK[k.lower()]
    cdp(
        "Input.dispatchKeyEvent",
        type="keyDown",
        code=code,
        key=k.lower(),
        windowsVirtualKeyCode=vk,
        nativeVirtualKeyCode=vk,
    )


def key_up(k):
    vk, code = _VK[k.lower()]
    cdp(
        "Input.dispatchKeyEvent",
        type="keyUp",
        code=code,
        key=k.lower(),
        windowsVirtualKeyCode=vk,
        nativeVirtualKeyCode=vk,
    )


def hotkey(k):
    """单次按键。游戏键位在 keydown 触发，按下后立刻抬起即可。"""
    key_down(k)
    time.sleep(0.03)
    key_up(k)
    time.sleep(0.05)
