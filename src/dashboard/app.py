"""
Phase 7 — Streamlit Dashboard

F1 2026 Race Outcome Prediction System

Tabs:
  1. Predict — upload qualifying CSV → ranked probability table + bar chart
  2. Driver Insight — rolling stats + SHAP contribution for a selected driver
  3. Model Info — feature importance, calibration curve, overall metrics

Run:
    streamlit run src/dashboard/app.py
"""

import pickle
import sys
from pathlib import Path
import warnings
warnings.filterwarnings("ignore")

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import streamlit as st

try:
    import shap
    SHAP_AVAILABLE = True
except ImportError:
    SHAP_AVAILABLE = False

# ── Path setup ────────────────────────────────────────────────────────────────
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from src.inference.predict import predict_race
from src.ingestion.config import DATA_PROCESSED

MODELS_DIR     = ROOT / "models" / "trained"
FEATURE_MATRIX = DATA_PROCESSED / "final_feature_matrix.parquet"
ANALYSIS_DIR   = ROOT / "docs" / "analysis"

# ── F1 colour palette ─────────────────────────────────────────────────────────
F1_RED   = "#e10600"
F1_DARK  = "#1a1a2e"
F1_GREY  = "#38383f"
F1_WHITE = "#ffffff"

TEAM_COLOURS = {
    "Red Bull Racing":  "#3671C6",
    "McLaren":          "#FF8000",
    "Ferrari":          "#E8002D",
    "Mercedes":         "#27F4D2",
    "Aston Martin":     "#229971",
    "Alpine":           "#FF87BC",
    "Haas":             "#B6BABD",
    "Racing Bulls":     "#6692FF",
    "Williams":         "#64C4FF",
    "Kick Sauber":      "#52E252",
}

# ── Page config ───────────────────────────────────────────────────────────────
st.set_page_config(
    page_title="F1 2026 Race Predictor",
    page_icon="🏁",
    layout="wide",
    initial_sidebar_state="expanded",
)

st.markdown(f"""
<style>
  .main {{ background-color: {F1_DARK}; }}
  h1, h2, h3 {{ color: {F1_WHITE}; }}
  .stTabs [data-baseweb="tab"] {{ color: {F1_WHITE}; }}
  .metric-card {{
    background: {F1_GREY};
    border-radius: 8px;
    padding: 12px 16px;
    margin: 4px;
    border-left: 4px solid {F1_RED};
  }}
</style>
""", unsafe_allow_html=True)

st.title("🏁 F1 2026 Race Outcome Predictor")
st.caption("Powered by FastF1 · XGBoost · SHAP")


# ── Helpers ───────────────────────────────────────────────────────────────────

@st.cache_resource
def load_model(name="xgb_top10.pkl"):
    path = MODELS_DIR / name
    if not path.exists():
        return None
    with open(path, "rb") as f:
        return pickle.load(f)


@st.cache_data
def load_feature_matrix():
    if not FEATURE_MATRIX.exists():
        return None
    return pd.read_parquet(FEATURE_MATRIX)


@st.cache_data
def load_analysis_csv(name):
    path = ANALYSIS_DIR / name
    if path.exists():
        return pd.read_csv(path)
    return None


def team_colour(team_name: str) -> str:
    for k, v in TEAM_COLOURS.items():
        if k.lower() in team_name.lower():
            return v
    return F1_GREY


# ── Sidebar ───────────────────────────────────────────────────────────────────

with st.sidebar:
    st.header("Race Settings")

    season = st.number_input("Season", min_value=2024, max_value=2030, value=2026)
    round_num = st.number_input("Round", min_value=1, max_value=24, value=1)
    circuit_id = st.text_input("Circuit", value="Bahrain International Circuit")

    st.markdown("---")
    st.subheader("Weather Forecast")
    is_wet   = st.checkbox("Wet Race", value=False)
    air_temp = st.slider("Air Temperature (°C)", 10, 45, 28)
    trk_temp = st.slider("Track Temperature (°C)", 15, 60, 40)

    weather = {
        "rainfall":        is_wet,
        "air_temp_mean":   float(air_temp),
        "track_temp_mean": float(trk_temp),
    }

    st.markdown("---")
    model_choice = st.selectbox("Model", ["xgb_top10.pkl", "logistic_baseline.pkl"])

# ── Load resources ────────────────────────────────────────────────────────────

artifact = load_model(model_choice)
feat_matrix = load_feature_matrix()

if artifact is None:
    st.error("No trained model found. Run `python -m src.models.train` first.")
    st.stop()

if feat_matrix is None:
    st.warning("Feature matrix not found. Run the full pipeline first.")

# ── Tabs ──────────────────────────────────────────────────────────────────────

tab1, tab2, tab3 = st.tabs(["🏎️ Predict", "👤 Driver Insight", "📊 Model Info"])


# ════════════════════════════════════════════════════════════════════════════
# TAB 1 — Predict
# ════════════════════════════════════════════════════════════════════════════

with tab1:
    st.subheader(f"Qualifying Input — {season} Round {round_num}")

    input_method = st.radio(
        "Input method",
        ["Upload CSV", "Use sample (2026 Bahrain)"],
        horizontal=True,
    )

    quali_df = None

    if input_method == "Upload CSV":
        uploaded = st.file_uploader(
            "Upload qualifying results CSV",
            type="csv",
            help="Columns: driver_code, team_name, quali_position, q1_time_ms, q2_time_ms, q3_time_ms",
        )
        if uploaded:
            quali_df = pd.read_csv(uploaded)

    else:
        sample_path = ROOT / "data" / "raw" / "sample_quali_2026_bahrain.csv"
        if sample_path.exists():
            quali_df = pd.read_csv(sample_path)
            st.info("Using sample 2026 Bahrain qualifying data.")
        else:
            st.error("Sample file not found at data/raw/sample_quali_2026_bahrain.csv")

    if quali_df is not None:
        with st.expander("View qualifying input", expanded=False):
            st.dataframe(quali_df, use_container_width=True)

        if st.button("🚀 Run Prediction", type="primary"):
            with st.spinner("Predicting..."):
                try:
                    result = predict_race(
                        quali_input=quali_df,
                        circuit_id=circuit_id,
                        round_num=round_num,
                        season=season,
                        weather=weather,
                        model_name=model_choice,
                    )
                    st.session_state["last_result"] = result
                    st.session_state["last_quali"]  = quali_df
                except Exception as e:
                    st.error(f"Prediction failed: {e}")
                    st.exception(e)

    # Show results
    if "last_result" in st.session_state:
        result = st.session_state["last_result"]

        st.markdown("### Predicted Race Order")

        # Top metrics
        top5 = result.head(5)
        cols = st.columns(5)
        for i, (_, row) in enumerate(top5.iterrows()):
            with cols[i]:
                colour = team_colour(row.get("team_name", ""))
                st.markdown(f"""
                <div class="metric-card" style="border-left-color:{colour}">
                  <div style="font-size:11px;color:#aaa">P{i+1}</div>
                  <div style="font-size:18px;font-weight:bold;color:{F1_WHITE}">{row['driver_code']}</div>
                  <div style="font-size:12px;color:#ccc">{row.get('team_name','')}</div>
                  <div style="font-size:16px;color:{colour}">{row['prob_top10']:.1%}</div>
                </div>
                """, unsafe_allow_html=True)

        st.markdown("---")

        # Full ranked table
        display = result[["expected_position", "driver_code", "team_name",
                           "quali_position", "prob_top10"]].copy()
        display.columns = ["Predicted P", "Driver", "Team", "Quali P", "Top-10 Prob"]
        display["Top-10 Prob"] = display["Top-10 Prob"].apply(lambda x: f"{x:.1%}")
        st.dataframe(display, use_container_width=True, hide_index=True)

        # Horizontal bar chart
        st.markdown("### Top-10 Probability by Driver")
        fig, ax = plt.subplots(figsize=(10, 6), facecolor=F1_DARK)
        ax.set_facecolor(F1_DARK)

        drivers = result["driver_code"].tolist()
        probs   = result["prob_top10"].tolist()
        colours = [team_colour(t) for t in result["team_name"].tolist()]

        bars = ax.barh(drivers[::-1], probs[::-1], color=colours[::-1], edgecolor="none", height=0.7)
        ax.axvline(0.5, color=F1_RED, linestyle="--", linewidth=1, alpha=0.7, label="50% threshold")

        ax.set_xlabel("Predicted Top-10 Probability", color=F1_WHITE)
        ax.set_xlim(0, 1)
        ax.tick_params(colors=F1_WHITE)
        for spine in ax.spines.values():
            spine.set_visible(False)

        # Probability labels
        for bar, prob in zip(bars[::-1], probs[::-1]):
            ax.text(
                bar.get_width() + 0.01, bar.get_y() + bar.get_height() / 2,
                f"{prob:.1%}", va="center", ha="left", color=F1_WHITE, fontsize=9,
            )

        ax.legend(facecolor=F1_GREY, labelcolor=F1_WHITE, framealpha=0.5)
        plt.tight_layout()
        st.pyplot(fig)
        plt.close()

        # Download button
        csv = result.to_csv(index=False)
        st.download_button(
            "⬇️ Download predictions CSV",
            data=csv,
            file_name=f"predictions_{season}_r{round_num}.csv",
            mime="text/csv",
        )


# ════════════════════════════════════════════════════════════════════════════
# TAB 2 — Driver Insight
# ════════════════════════════════════════════════════════════════════════════

with tab2:
    st.subheader("Driver Insight")

    if feat_matrix is None:
        st.warning("Feature matrix required. Run the full pipeline first.")
    else:
        all_drivers = sorted(feat_matrix["driver_code"].unique())
        selected_driver = st.selectbox("Select Driver", all_drivers)

        driver_hist = feat_matrix[feat_matrix["driver_code"] == selected_driver].copy()
        driver_hist = driver_hist.sort_values(["season", "round"])

        if driver_hist.empty:
            st.warning(f"No history found for {selected_driver}")
        else:
            latest = driver_hist.iloc[-1]

            # Quick stats
            col1, col2, col3, col4 = st.columns(4)
            col1.metric("Races", int(latest.get("driver_experience", 0)))
            col2.metric("Avg Finish (L5)", f"{latest.get('driver_avg_finish_L5', 0):.1f}")
            col3.metric("DNF Rate (L10)", f"{latest.get('driver_dnf_rate_L10', 0):.1%}")
            col4.metric("Points (L5)", f"{latest.get('driver_points_L5', 0):.0f}")

            # Rolling form chart
            st.markdown("#### Rolling Average Finish Position (L10)")
            roll_data = driver_hist[["season", "round", "driver_avg_finish_L10"]].dropna()

            if not roll_data.empty:
                fig, ax = plt.subplots(figsize=(10, 3), facecolor=F1_DARK)
                ax.set_facecolor(F1_DARK)

                x = range(len(roll_data))
                y = roll_data["driver_avg_finish_L10"].values

                ax.plot(x, y, color=F1_RED, linewidth=2)
                ax.fill_between(x, y, 20, alpha=0.15, color=F1_RED)
                ax.invert_yaxis()  # P1 at top

                # Season separators
                season_starts = roll_data.reset_index(drop=True)
                for s in season_starts["season"].unique()[1:]:
                    idx = season_starts[season_starts["season"] == s].index[0]
                    ax.axvline(idx, color=F1_GREY, linestyle="--", alpha=0.5)
                    ax.text(idx + 0.2, ax.get_ylim()[0] + 0.5, str(s),
                            color="#aaa", fontsize=8)

                ax.set_ylabel("Avg Finish (lower=better)", color=F1_WHITE)
                ax.tick_params(colors=F1_WHITE)
                ax.set_ylim(20, 1)
                for spine in ax.spines.values():
                    spine.set_visible(False)
                plt.tight_layout()
                st.pyplot(fig)
                plt.close()

            # SHAP for this driver's last known race
            st.markdown("#### SHAP Feature Contributions (latest race)")
            if not SHAP_AVAILABLE:
                st.warning("SHAP not installed. Run `pip install shap` to enable this section.")
            elif "last_result" in st.session_state and artifact is not None:
                result = st.session_state["last_result"]
                quali  = st.session_state.get("last_quali")

                if quali is not None and selected_driver in quali["driver_code"].values:
                    try:
                        # Re-run prediction to get feature values
                        from src.inference.predict import (
                            _get_latest_rolling_stats,
                            _build_quali_features,
                            _attach_weather,
                            _attach_temporal,
                        )
                        rolling  = _get_latest_rolling_stats(feat_matrix, circuit_id)
                        quali_f  = _build_quali_features(quali)
                        features = quali_f.merge(
                            rolling.drop(columns=["team_name"], errors="ignore"),
                            on="driver_code", how="left",
                        )
                        features = _attach_weather(features, weather)
                        features = _attach_temporal(features, round_num)

                        driver_row = features[features["driver_code"] == selected_driver]

                        if not driver_row.empty:
                            model_cols = artifact["features"]
                            X_row = driver_row.reindex(columns=model_cols).fillna(0)
                            X_imp = pd.DataFrame(
                                artifact["imputer"].transform(X_row),
                                columns=model_cols,
                            )

                            explainer   = shap.TreeExplainer(artifact["model"])
                            shap_vals   = explainer.shap_values(X_imp)
                            shap_series = pd.Series(shap_vals[0], index=model_cols).sort_values()

                            # Bar chart of SHAP values
                            fig, ax = plt.subplots(figsize=(9, 5), facecolor=F1_DARK)
                            ax.set_facecolor(F1_DARK)
                            colours_shap = [F1_RED if v > 0 else "#4488ff" for v in shap_series]
                            ax.barh(shap_series.index, shap_series.values,
                                    color=colours_shap, edgecolor="none")
                            ax.axvline(0, color=F1_WHITE, linewidth=0.8)
                            ax.set_xlabel("SHAP value (impact on top-10 probability)", color=F1_WHITE)
                            ax.tick_params(colors=F1_WHITE, labelsize=9)
                            for spine in ax.spines.values():
                                spine.set_visible(False)

                            red_p  = mpatches.Patch(color=F1_RED,    label="Increases prob")
                            blue_p = mpatches.Patch(color="#4488ff", label="Decreases prob")
                            ax.legend(handles=[red_p, blue_p],
                                      facecolor=F1_GREY, labelcolor=F1_WHITE, framealpha=0.5)
                            plt.tight_layout()
                            st.pyplot(fig)
                            plt.close()
                    except Exception as e:
                        st.warning(f"SHAP computation failed: {e}")
                else:
                    st.info("Run a prediction in Tab 1 first to see SHAP for this driver.")
            else:
                st.info("Run a prediction in Tab 1 first to see SHAP contributions.")


# ════════════════════════════════════════════════════════════════════════════
# TAB 3 — Model Info
# ════════════════════════════════════════════════════════════════════════════

with tab3:
    st.subheader("Model Performance & Explainability")

    # Overall metrics
    metrics_df = load_analysis_csv("overall_metrics.csv")
    if metrics_df is not None:
        st.markdown("#### Overall Metrics")
        st.dataframe(
            metrics_df.set_index("split").round(4),
            use_container_width=True,
        )
    else:
        st.info("Run `python -m src.models.analysis` to generate metrics.")

    col1, col2 = st.columns(2)

    # Calibration plot
    with col1:
        st.markdown("#### Calibration Curve (val set)")
        cal_path = ANALYSIS_DIR / "calibration_val.png"
        if cal_path.exists():
            st.image(str(cal_path), use_container_width=True)
        else:
            st.info("Run analysis.py to generate calibration plot.")

    # SHAP importance
    with col2:
        st.markdown("#### SHAP Feature Importance")
        shap_path = ANALYSIS_DIR / "shap_importance.png"
        if shap_path.exists():
            st.image(str(shap_path), use_container_width=True)
        else:
            st.info("Run analysis.py to generate SHAP plot.")

    # SHAP beeswarm
    st.markdown("#### SHAP Beeswarm")
    bee_path = ANALYSIS_DIR / "shap_beeswarm.png"
    if bee_path.exists():
        st.image(str(bee_path), use_container_width=True)
    else:
        st.info("Run analysis.py to generate beeswarm plot.")

    # Error breakdowns
    st.markdown("#### Error Breakdown by Driver Tier")
    tier_df = load_analysis_csv("breakdown_driver_tier.csv")
    if tier_df is not None:
        st.dataframe(tier_df.round(4), use_container_width=True, hide_index=True)

    st.markdown("#### Error Breakdown by Circuit")
    circuit_df = load_analysis_csv("breakdown_circuit.csv")
    if circuit_df is not None:
        st.dataframe(
            circuit_df.sort_values("roc_auc").round(4),
            use_container_width=True, hide_index=True,
        )

    # XGBoost native feature importance
    if artifact and "importance" in artifact:
        st.markdown("#### XGBoost Feature Importance (Gain)")
        imp = artifact["importance"].head(15)
        fig, ax = plt.subplots(figsize=(8, 5), facecolor=F1_DARK)
        ax.set_facecolor(F1_DARK)
        ax.barh(imp.index[::-1], imp.values[::-1], color=F1_RED, edgecolor="none")
        ax.set_xlabel("Importance (gain)", color=F1_WHITE)
        ax.tick_params(colors=F1_WHITE, labelsize=9)
        for spine in ax.spines.values():
            spine.set_visible(False)
        plt.tight_layout()
        st.pyplot(fig)
        plt.close()
