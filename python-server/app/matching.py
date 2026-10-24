"""Traveler compatibility scoring kept in sync with the React UI."""
WEIGHTS = {
    "style": 14, "pace": 12, "budget": 14, "groupSize": 8,
    "accommodation": 8, "climate": 8, "interests": 20, "activities": 10, "habits": 6,
}
BUDGETS = [
    ("Shoestring (₹)", "Shoestring ($)"),
    ("Moderate (₹₹)", "Moderate ($$)"),
    ("Comfortable (₹₹₹)", "Comfortable ($$$)"),
    ("Premium (₹₹₹₹)", "Premium ($$$$)"),
]
PACES = ["Slow and restful", "Balanced", "Packed days", "Dawn-to-dusk"]
SIZES = ["2-3 people", "4-6 people", "7-10 people", "10+ people"]


def _exact(a, b, neutral=0.4):
    if not a or not b:
        return neutral
    return 1.0 if a.casefold() == b.casefold() else 0.15


def _ordered(a, b, scale):
    if not a or not b or a not in scale or b not in scale:
        return 0.4
    d = abs(scale.index(a) - scale.index(b))
    return 1.0 if d == 0 else 0.6 if d == 1 else 0.15


def _ordered_budget(a, b):
    ia = next((i for i, tier in enumerate(BUDGETS) if a in tier), -1)
    ib = next((i for i, tier in enumerate(BUDGETS) if b in tier), -1)
    if ia < 0 or ib < 0:
        return 0.4
    distance = abs(ia - ib)
    return 1.0 if distance == 0 else 0.6 if distance == 1 else 0.15


def _overlap(a, b):
    a = {value.casefold() for value in (a or [])}
    b = {value.casefold() for value in (b or [])}
    if not a or not b:
        return 0.35
    return len(a & b) / len(a | b)


def score_compatibility(me: dict, other: dict) -> dict:
    interests = me.get("interests") or []
    theirs = other.get("interests") or []
    activities = me.get("activities") or []
    their_activities = other.get("activities") or []
    parts = {
        "style": _exact(me.get("travel_style"), other.get("travel_style")),
        "pace": _ordered(me.get("pace"), other.get("pace"), PACES),
        "budget": _ordered_budget(me.get("budget_level"), other.get("budget_level")),
        "groupSize": _ordered(me.get("group_size"), other.get("group_size"), SIZES),
        "accommodation": _exact(me.get("accommodation"), other.get("accommodation")),
        "climate": _exact(me.get("climate_preference"), other.get("climate_preference")),
        "interests": _overlap(interests, theirs),
        "activities": _overlap(activities, their_activities),
        "habits": (
            _exact(me.get("smoking"), other.get("smoking"), 0.5)
            + _exact(me.get("drinking"), other.get("drinking"), 0.5)
            + (0.5 if me.get("early_riser") is None or other.get("early_riser") is None
               else 1.0 if me.get("early_riser") == other.get("early_riser") else 0.3)
        ) / 3,
    }
    total = sum(WEIGHTS.values())
    score = round(sum(parts[key] * weight for key, weight in WEIGHTS.items()) / total * 100)
    shared = {value.casefold() for value in interests} & {value.casefold() for value in theirs}
    return {
        "score": score,
        "breakdown": {key: round(value * 100) for key, value in parts.items()},
        "sharedInterests": [value for value in interests if value.casefold() in shared],
        "sharedDestinations": [
            value for value in (me.get("dream_destinations") or [])
            if value.casefold() in {v.casefold() for v in (other.get("dream_destinations") or [])}
        ],
    }



    
