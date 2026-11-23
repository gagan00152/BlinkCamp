// Routine picker: a dropdown menu of every routine, or the original previous/next arrows
// (chosen in Settings). Shuffle lives in Shuffle.ts.
import RoutineManager, { SelectRoutine } from "./Dot/DotRoutineManager.js";
import { RegisterPopover, ClosePopover, EnableMenuKeyboard } from "./Menus.js";
const storageKeys = {
    mode: "blinkcamp.pickerMode",
};
let mode = "dropdown";
let dock;
let menu;
let modeButtons;
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
const MenuItems = () => Array.from(menu.querySelectorAll("[role=menuitemradio]"));
const UpdateMenuSelection = () => {
    MenuItems().forEach(item => {
        item.setAttribute("aria-checked", String(Number(item.dataset.index) === RoutineManager.currentRoutineIndex));
    });
};
const BuildMenu = () => {
    RoutineManager.activeDotRoutines.forEach((routine, index) => {
        const item = document.createElement("li");
        item.setAttribute("role", "none");
        const button = document.createElement("button");
        button.type = "button";
        button.setAttribute("role", "menuitemradio");
        button.dataset.index = String(index);
        button.textContent = routine.title;
        button.addEventListener("click", () => {
            SelectRoutine(index);
            ClosePopover(true);
        });
        item.appendChild(button);
        menu.appendChild(item);
    });
    UpdateMenuSelection();
};
const ApplyMode = (newMode) => {
    mode = newMode;
    dock.dataset.picker = mode;
    if (mode === "arrows") {
        ClosePopover();
    }
    modeButtons.forEach(button => {
        const selected = button.dataset.mode === mode;
        button.classList.toggle("selected", selected);
        button.setAttribute("aria-pressed", String(selected));
    });
};
export const InitializeRoutinePicker = () => {
    dock = document.querySelector(".dock");
    menu = document.getElementById("routinemenu");
    modeButtons = Array.from(document.querySelectorAll(".pickermode"));
    const routineButton = document.getElementById("routinebutton");
    BuildMenu();
    EnableMenuKeyboard(menu, "[role=menuitemradio]");
    RegisterPopover(routineButton, menu, {
        canOpen: () => mode === "dropdown",
        onOpen: () => {
            const selected = menu.querySelector("[aria-checked=true]");
            selected === null || selected === void 0 ? void 0 : selected.scrollIntoView({ block: "nearest" });
            selected === null || selected === void 0 ? void 0 : selected.focus();
        },
    });
    document.getElementById("routineprev").addEventListener("click", () => window.dispatchEvent(new CustomEvent("Game:LeftArrowClick")));
    document.getElementById("routinenext").addEventListener("click", () => window.dispatchEvent(new CustomEvent("Game:RightArrowClick")));
    modeButtons.forEach(button => {
        button.addEventListener("click", () => {
            ApplyMode(button.dataset.mode);
            Save(storageKeys.mode, mode);
        });
    });
    window.addEventListener("DotRoutineManager:RoutineChanged", UpdateMenuSelection);
    window.addEventListener("Game:ResetSettings", () => {
        ApplyMode("dropdown");
        Save(storageKeys.mode, mode);
    });
    ApplyMode(Load(storageKeys.mode) === "arrows" ? "arrows" : "dropdown");
};
