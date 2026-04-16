#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import numpy as np
import pandas as pd
import os
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier

# =====================================================
# 1. LOAD DATASET
# =====================================================

FILE_PATH = "/home/aqua/fish1/dataset4.xlrd"

if not os.path.isfile(FILE_PATH):
    raise FileNotFoundError(f"File not found: {FILE_PATH}")

data = pd.read_excel(FILE_PATH) if not FILE_PATH.endswith(".csv") else pd.read_csv(FILE_PATH)

# =====================================================
# 2. FEATURES
# =====================================================

FEATURES = ['DO', 'TURBIDITY', 'TEMP', 'AMMONIA(mg/l)', 'PH']
TARGET = 'species'

data = data[FEATURES + [TARGET]]
data = data.dropna(subset=[TARGET])

# =====================================================
# 3. NORMALIZE SPECIES COMBINATIONS
# =====================================================

def normalize_species(s):
    items = [x.strip() for x in str(s).split(',')]
    cleaned = []
    tilapia = False
    for sp in items:
        if "tilapia" in sp.lower():
            tilapia = True
        else:
            cleaned.append(sp)
    if tilapia:
        cleaned.append("Tilapia")
    return sorted(set(cleaned))

data['species_list'] = data['species'].apply(normalize_species)
data['species_tuple'] = data['species_list'].apply(tuple)

combo_map = {t: i for i, t in enumerate(data['species_tuple'].unique())}
id_to_species = {v: list(k) for k, v in combo_map.items()}
data['list_id'] = data['species_tuple'].apply(lambda x: combo_map[x])

# =====================================================
# 4. ML TRAINING (UNCHANGED)
# =====================================================

X = data[FEATURES].replace([np.inf, -np.inf], np.nan).fillna(data[FEATURES].mean())
y = data['list_id']

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

rf = RandomForestClassifier(n_estimators=300, random_state=42, n_jobs=-1)
rf.fit(X_train, y_train)

# =====================================================
# 5. ECOLOGICAL RULES (UNCHANGED)
# =====================================================

PREDATORS = {"walking catfish","snakehead","murrel","barramundi","asian seabass"}
SURFACE = {"Catla","Silver Carp"}
MIDDLE  = {"Rohu","Tilapia","Pearlspot","Milkfish","Mullet"}
BOTTOM  = {"Mrigal","Common Carp","Catfish (Clarias)","Pangasius","Magur","Singhi"}
VEG     = {"Grass Carp"}

def remove_predators(species):
    kept, removed = [], []
    for s in species:
        if any(p in s.lower() for p in PREDATORS):
            removed.append(s)
        else:
            kept.append(s)
    return kept, removed

def assign_groups(species):
    groups={"surface":[], "middle":[], "bottom":[], "vegetation":[]}
    for s in species:
        if s in SURFACE: groups["surface"].append(s)
        elif s in MIDDLE: groups["middle"].append(s)
        elif s in BOTTOM: groups["bottom"].append(s)
        elif s in VEG: groups["vegetation"].append(s)
    return groups

# =====================================================
# 6. STOCKING SYSTEMS (UNCHANGED)
# =====================================================

def six_species(depth="deep"):
    return {"Catla":"10–15%","Silver Carp":"30–35%","Rohu":"20–25%",
            "Mrigal":"15–20%","Common Carp":"15–20%","Grass Carp":"5–10%"}

def five_species():
    return {"Silver Carp":"20–30%","Catla":"10–15%","Rohu":"15–20%",
            "Mrigal":"10–15%","Common Carp":"15–20%"}

def four_species(depth="deep"):
    return {"Catla":"30–40%","Rohu":"20–30%",
            "Mrigal":"15–20%","Common Carp":"15–20%"}

def three_species():
    return {"Catla":"40%","Rohu":"30%","Common Carp":"30%"}

def fallback(groups):
    base={"surface":30,"middle":40,"bottom":30}
    active={k:v for k,v in groups.items() if v and k!="vegetation"}
    total=sum(base[g] for g in active)
    result={}
    for g,species in active.items():
        share=base[g]/total*100
        each=share/len(species)
        for s in species:
            result[s]=round(each,2)
    return result

# =====================================================
# 7. DECISION ENGINE (UNCHANGED)
# =====================================================

def decision_engine(ml_species, depth="deep"):

    clean, removed = remove_predators(ml_species)
    groups = assign_groups(clean)
    s=set(clean)

    if {"Catla","Silver Carp","Rohu","Mrigal","Common Carp","Grass Carp"}.issubset(s):
        return "Polyculture",1,"Approved",removed,groups,six_species(depth)

    if {"Catla","Silver Carp","Rohu","Mrigal","Common Carp"}.issubset(s):
        return "Polyculture",2,"Approved",removed,groups,five_species()

    if {"Catla","Rohu","Mrigal","Common Carp"}.issubset(s):
        return "Composite Culture",3,"Approved",removed,groups,four_species(depth)

    if {"Catla","Rohu"}.issubset(s):
        return "Basic Culture",4,"Approved",removed,groups,three_species()

    if len(clean)>=3:
        return "Composite Culture",5,"Approved",removed,groups,fallback(groups)

    return "Not Recommended",None,"Rejected",removed,groups,{}

# =====================================================
# 8. FINAL FUNCTION → MONGODB DOCUMENT
# =====================================================

def predict_document(water_data, projectTitle=None, testNumber=None):

    sample = [[
        water_data["dissolvedOxygen"],
        water_data["turbidity"],
        water_data["temperature"],
        water_data["ammonia"],
        water_data["ph"]
    ]]

    sample_df = pd.DataFrame(sample, columns=FEATURES)

    list_id = rf.predict(sample_df)[0]
    ml_species = id_to_species[list_id]

    system, priority, status, removed, groups, ratio = decision_engine(ml_species)

    # ===== ONLY OUTPUT FORMAT CHANGED =====

    return {

        "testNumber": testNumber,
        "projectTitle": projectTitle,
        "status": "Completed",

        "waterParameters": water_data,

        "fishPrediction": {
            "predictedSpecies": ml_species,
            "removedPredators": removed,
            "groupedSpecies": groups
        },

        "stackingData": {
            "cultureSystem": system,
            "priority": "High" if priority==1 else "Medium",
            "status": status
        },

        "stockingRatio": ratio
    }
