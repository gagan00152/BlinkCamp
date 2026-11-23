// Shuffle: moves through the routines in a random order without repeats (every routine
// plays once before any comes back), switching on one of two schedules:
//
//   Auto (default)
//     Timed session (2 / 5 / 10 min): the session is split across the routines, so each gets a
//       fair share, DVD and Peek-a-boo get double (their base duration is 30s instead of 15s),
//       nobody gets less than 15s (short sessions use a random subset instead), and the last
//       routine ends exactly when the timer reaches 00:00.
//     Free: each routine's own duration (15s or 30s), as before.
//   Fixed: 30s / 1 / 2 / 5 min per routine, in any session. If the session is shorter than
//     the interval, the routine simply doesn't change before the session ends.
//
// Only active exercise time counts: pausing holds the schedule, Stop restarts it in a new order.
import RoutineManager, { SelectRoutine } from "./Dot/DotRoutineManager.js";
import { IsSessionRunning, GetSessionInfo } from "./SessionTimer.js";
const storageKeys = {
    enabled: "blinkcamp.shuffle",
    interval: "blinkcamp.shuffleInterval",
};
const minSecondsPerRoutine = 15;
const baseSecondsPerUnit = 15;
// A frame longer than this (e.g. after the tab was hidden) doesn't count as exercise time.
const maxCountedFrameSeconds = 0.25;
let enabled = false;
let interval = "auto";
// Random order without repeats ("shuffle bag").
let bag = [];
let plan = null;
let planPosition = 0;
// Free or fixed interval: active seconds spent on the current routine.
let secondsOnRoutine = 0;
let shuffleButton;
let statusLabel;
let intervalButtons = [];
let intervalNote;
let lastStatusText = "";
const Load = (key) => {
    try {
        return localStorage.getItem(key);
    }
    catch (_a) {
        return null;
    }
};
const Save = (key, value) => {
    try {
        localStorage.setItem(key, value);
    }
    catch ( /* storage unavailable - setting just won't persist */_a) { /* storage unavailable - setting just won't persist */ }
};
const RoutineCount = () => RoutineManager.activeDotRoutines.length;
const Current = () => RoutineManager.currentRoutineIndex;
// 1 for 15s routines, 2 for 30s ones (DVD, Peek-a-boo).
const Weight = (index) => RoutineManager.activeDotRoutines[index].duration / baseSecondsPerUnit;
const ShuffledOthers = (exclude) => {
    const indexes = Array.from({ length: RoutineCount() }, (_, i) => i).filter(i => i !== exclude);
    for (let i = indexes.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indexes[i], indexes[j]] = [indexes[j], indexes[i]];
    }
    return indexes;
};
const NextFromBag = () => {
    if (bag.length === 0) {
        bag = ShuffledOthers(Current());
    }
    return bag.shift();
};
const FormatSeconds = (seconds) => {
    const whole = Math.max(0, Math.ceil(seconds));
    const secs = whole % 60;
    return `${Math.floor(whole / 60)}:${secs < 10 ? "0" : ""}${secs}`;
};
// Auto + timed session: split the remaining time over the routines, starting with the current one.
const BuildPlan = () => {
    plan = null;
    planPosition = 0;
    secondsOnRoutine = 0;
    bag = [];
    const { presetSeconds, elapsedSeconds } = GetSessionInfo();
    const remaining = presetSeconds - elapsedSeconds;
    if (!enabled || interval !== "auto" || presetSeconds === 0 || remaining <= 0) {
        return;
    }
    // Take routines in random order while each can still get at least 15s per unit of weight.
    const order = [Current(), ...ShuffledOthers(Current())];
    const chosen = [];
    let units = 0;
    for (const index of order) {
        if (chosen.length === 0 || (units + Weight(index)) * minSecondsPerRoutine <= remaining) {
            chosen.push(index);
            units += Weight(index);
        }
    }
    const secondsPerUnit = remaining / units;
    let endsAt = elapsedSeconds;
    plan = chosen.map((index, i) => {
        endsAt = i === chosen.length - 1 ? presetSeconds : endsAt + Weight(index) * secondsPerUnit;
        return { index, endsAt };
    });
};
const SwitchTo = (index) => {
    if (index !== Current()) {
        SelectRoutine(index);
        window.dispatchEvent(new CustomEvent("Shuffle:RoutineChanged"));
    }
};
const SecondsPerRoutine = () => interval === "auto" ? RoutineManager.activeDotRoutines[Current()].duration : interval;
// "3/12 · next 0:42" next to the routine name while Shuffle is on.
const RenderStatus = () => {
    if (!statusLabel) {
        return;
    }
    let text = "";
    if (enabled) {
        const { presetSeconds, elapsedSeconds } = GetSessionInfo();
        if (plan) {
            const step = plan[planPosition];
            const isLast = planPosition === plan.length - 1;
            text = `${planPosition + 1}/${plan.length}` + (isLast ? " · last" : ` · next ${FormatSeconds(step.endsAt - elapsedSeconds)}`);
        }
        else {
            const untilNext = SecondsPerRoutine() - secondsOnRoutine;
            const sessionLeft = presetSeconds > 0 ? presetSeconds - elapsedSeconds : Infinity;
            text = untilNext >= sessionLeft ? "last" : `next ${FormatSeconds(untilNext)}`;
        }
    }
    if (text !== lastStatusText) {
        lastStatusText = text;
        statusLabel.textContent = text;
        statusLabel.hidden = text === "";
    }
};
const RenderSettings = () => {
    intervalButtons.forEach(button => {
        const selected = button.dataset.interval === String(interval);
        button.classList.toggle("selected", selected);
        button.setAttribute("aria-pressed", String(selected));
    });
    if (intervalNote) {
        const { presetSeconds } = GetSessionInfo();
        intervalNote.textContent = interval === "auto"
            ? "Auto fits the session: every exercise gets a fair share, ending exactly at 00:00."
            : presetSeconds > 0 && interval >= presetSeconds
                ? "This session is shorter than the change time, so the exercise won't change."
                : `Changes every ${interval < 60 ? `${interval} seconds` : `${interval / 60} min`} of exercise.`;
    }
};
const Tick = (dTime) => {
    if (!enabled || !IsSessionRunning()) {
        return;
    }
    if (plan) {
        const { elapsedSeconds } = GetSessionInfo();
        while (planPosition < plan.length - 1 && elapsedSeconds >= plan[planPosition].endsAt) {
            planPosition++;
            SwitchTo(plan[planPosition].index);
        }
    }
    else {
        secondsOnRoutine += Math.min(dTime, maxCountedFrameSeconds);
        if (secondsOnRoutine >= SecondsPerRoutine()) {
            SwitchTo(NextFromBag());
            secondsOnRoutine = 0;
        }
    }
    RenderStatus();
};
const ApplyEnabled = (value) => {
    enabled = value;
    shuffleButton.setAttribute("aria-pressed", String(enabled));
    shuffleButton.title = enabled ? "Shuffle is on: routines change automatically" : "Shuffle routines";
    BuildPlan();
    RenderStatus();
};
const ApplyInterval = (value) => {
    interval = value;
    BuildPlan();
    RenderSettings();
    RenderStatus();
};
const ParseInterval = (value) => {
    const number = Number(value);
    return number === 30 || number === 60 || number === 120 || number === 300 ? number : "auto";
};
export const InitializeShuffle = () => {
    shuffleButton = document.getElementById("shufflebutton");
    statusLabel = document.getElementById("shufflestatus");
    intervalButtons = Array.from(document.querySelectorAll(".shuffleinterval"));
    intervalNote = document.getElementById("shuffleintervalnote");
    shuffleButton.addEventListener("click", () => {
        ApplyEnabled(!enabled);
        Save(storageKeys.enabled, String(enabled));
    });
    intervalButtons.forEach(button => {
        button.addEventListener("click", () => {
            ApplyInterval(ParseInterval(button.dataset.interval));
            Save(storageKeys.interval, String(interval));
        });
    });
    // A new or restarted session gets a fresh plan in a new order.
    window.addEventListener("Session:Restarted", () => {
        BuildPlan();
        RenderSettings();
        RenderStatus();
    });
    // Picking a routine yourself gives it a full interval (the Auto plan keeps its schedule).
    window.addEventListener("DotRoutineManager:RoutineChanged", () => {
        secondsOnRoutine = 0;
        RenderStatus();
    });
    window.addEventListener("GameLoop:Update", (event) => {
        Tick(event.detail.dTime);
    });
    window.addEventListener("Game:ResetSettings", () => {
        ApplyEnabled(false);
        ApplyInterval("auto");
        Save(storageKeys.enabled, "false");
        Save(storageKeys.interval, "auto");
    });
    interval = ParseInterval(Load(storageKeys.interval));
    RenderSettings();
    ApplyEnabled(Load(storageKeys.enabled) === "true");
};
