"use client"

import React, { useState, useEffect, useCallback } from "react"
import styles from "./cookingPage.module.scss"
import Link from "next/link"

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

const PLACEHOLDER_MEALS = [
  "Spaghetti Bolognese",
  "Chicken Stir Fry",
  "Vegetable Curry",
  "Grilled Salmon",
  "Beef Tacos",
  "Mushroom Risotto",
  "Lamb Roast",
  "Pad Thai",
  "Caesar Salad",
  "BBQ Pulled Pork",
  "Lentil Soup",
  "Butter Chicken",
  "Fish and Chips",
  "Greek Salad",
  "Pumpkin Soup",
]

function randomMeal() {
  return PLACEHOLDER_MEALS[Math.floor(Math.random() * PLACEHOLDER_MEALS.length)]
}

type MealPlan = { day: string; breakfast: string; dinner: string }[]
type Tab = "ingredients" | "instructions" | "info"

interface MealDetails {
  idMeal: string
  strMeal: string
  strCategory: string
  strArea: string
  strInstructions: string
  strMealThumb: string
  [key: string]: string
}

function getIngredients(meal: MealDetails): { ingredient: string; measure: string }[] {
  const result = []
  for (let i = 1; i <= 20; i++) {
    const ingredient = meal[`strIngredient${i}`]
    const measure = meal[`strMeasure${i}`]
    if (ingredient && ingredient.trim()) {
      result.push({ ingredient: ingredient.trim(), measure: measure?.trim() || "" })
    }
  }
  return result
}

const features = [
  {
    title: "Random Meal Plan Generator",
    description: "Generate a full week of breakfast and dinner ideas with one click, pulling from a library of real recipes.",
  },
  {
    title: "Recipe API Integration",
    description: "Powered by TheMealDB open API — thousands of recipes with ingredients, instructions, and images.",
  },
  {
    title: "Smart Shopping List",
    description: "Automatically compile a consolidated ingredient list for your weekly plan, ready to take to the supermarket.",
  },
  {
    title: "Cooking Instructions",
    description: "Step-by-step cooking guidance for each meal, so you always know what to do next.",
  },
]

const techStack = ["React", "Next.js 15", "TypeScript", "TheMealDB API", "Firebase", "Firestore", "SCSS Modules"]

const CookingPage: React.FC = () => {
  const [mealPlan, setMealPlan] = useState<MealPlan>([])
  const [loading, setLoading] = useState(false)
  const [selectedMeal, setSelectedMeal] = useState<string | null>(null)
  const [mealDetails, setMealDetails] = useState<MealDetails | null>(null)
  const [modalLoading, setModalLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>("ingredients")

  function generatePlan() {
    setLoading(true)
    setTimeout(() => {
      setMealPlan(
        DAYS.map((day) => ({
          day,
          breakfast: randomMeal(),
          dinner: randomMeal(),
        }))
      )
      setLoading(false)
    }, 600)
  }

  const openMeal = useCallback(async (name: string) => {
    setSelectedMeal(name)
    setMealDetails(null)
    setModalLoading(true)
    setActiveTab("ingredients")
    try {
      const res = await fetch(`https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(name)}`)
      const data = await res.json()
      setMealDetails(data.meals?.[0] ?? null)
    } catch {
      setMealDetails(null)
    } finally {
      setModalLoading(false)
    }
  }, [])

  const closeModal = useCallback(() => {
    setSelectedMeal(null)
    setMealDetails(null)
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeModal()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [closeModal])

  const ingredients = mealDetails ? getIngredients(mealDetails) : []

  return (
    <div className={styles.cookingPage}>
      <section className={styles.hero}>
        <h1 className={styles.title}>Weekly Meal Planner</h1>
        <p className={styles.subtitle}>
          Generate a randomised weekly menu, discover recipes, and build your shopping list
        </p>
      </section>

      <section className={styles.overview}>
        <h2>About This Project</h2>
        <div className={styles.overviewContent}>
          <p>
            The Weekly Meal Planner takes the stress out of deciding what to eat. It generates a full
            week of meals using real recipes sourced from TheMealDB open API — click any meal name to
            see its ingredients, cooking instructions, and more.
          </p>
          <p>
            Shopping list compilation and user-saved plans via Firestore are coming next.
          </p>
        </div>
      </section>

      <section className={styles.generator}>
        <h2>Meal Plan Generator</h2>
        <p className={styles.generatorSubtitle}>Click to generate a random week of meals, then click any meal for its recipe</p>
        <button className={styles.generateButton} onClick={generatePlan} disabled={loading}>
          {loading ? "Generating..." : "Generate This Week's Plan"}
        </button>

        {mealPlan.length > 0 && (
          <div className={styles.planGrid}>
            {mealPlan.map(({ day, breakfast, dinner }) => (
              <div key={day} className={styles.dayCard}>
                <h3 className={styles.dayName}>{day}</h3>
                <div className={styles.meal}>
                  <span className={styles.mealLabel}>Breakfast</span>
                  <button className={styles.mealName} onClick={() => openMeal(breakfast)}>{breakfast}</button>
                </div>
                <div className={styles.meal}>
                  <span className={styles.mealLabel}>Dinner</span>
                  <button className={styles.mealName} onClick={() => openMeal(dinner)}>{dinner}</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className={styles.features}>
        <h2>Planned Features</h2>
        <div className={styles.featuresGrid}>
          {features.map((feature) => (
            <div key={feature.title} className={styles.featureCard}>
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.techStack}>
        <h2>Technology Stack</h2>
        <div className={styles.techList}>
          {techStack.map((tech) => (
            <span key={tech} className={styles.techTag}>{tech}</span>
          ))}
        </div>
      </section>

      <section className={styles.backLink}>
        <Link href="/projects">← Back to Projects</Link>
      </section>

      {selectedMeal && (
        <div className={styles.modalOverlay} onClick={closeModal}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <button className={styles.modalClose} onClick={closeModal}>✕</button>

            {modalLoading && <p className={styles.modalLoading}>Loading recipe...</p>}

            {!modalLoading && !mealDetails && (
              <p className={styles.modalLoading}>No recipe found for &quot;{selectedMeal}&quot;</p>
            )}

            {!modalLoading && mealDetails && (
              <>
                <div className={styles.modalHeader}>
                  {mealDetails.strMealThumb && (
                    <img src={mealDetails.strMealThumb} alt={mealDetails.strMeal} className={styles.modalImage} />
                  )}
                  <h2 className={styles.modalTitle}>{mealDetails.strMeal}</h2>
                  <div className={styles.modalMeta}>
                    {mealDetails.strCategory && <span>{mealDetails.strCategory}</span>}
                    {mealDetails.strArea && <span>{mealDetails.strArea}</span>}
                  </div>
                </div>

                <div className={styles.tabs}>
                  {(["ingredients", "instructions", "info"] as Tab[]).map((tab) => (
                    <button
                      key={tab}
                      className={`${styles.tab} ${activeTab === tab ? styles.tabActive : ""}`}
                      onClick={() => setActiveTab(tab)}
                    >
                      {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </button>
                  ))}
                </div>

                <div className={styles.tabContent}>
                  {activeTab === "ingredients" && (
                    <ul className={styles.ingredientList}>
                      {ingredients.map(({ ingredient, measure }) => (
                        <li key={ingredient} className={styles.ingredientItem}>
                          <span className={styles.ingredientName}>{ingredient}</span>
                          <span className={styles.ingredientMeasure}>{measure}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {activeTab === "instructions" && (
                    <div className={styles.instructions}>
                      {mealDetails.strInstructions.split("\n").filter(Boolean).map((step, i) => (
                        <p key={i}>{step}</p>
                      ))}
                    </div>
                  )}

                  {activeTab === "info" && (
                    <div className={styles.infoTab}>
                      <p><strong>Cuisine:</strong> {mealDetails.strArea || "Unknown"}</p>
                      <p><strong>Category:</strong> {mealDetails.strCategory || "Unknown"}</p>
                      {mealDetails.strYoutube && (
                        <p>
                          <strong>Video: </strong>
                          <a href={mealDetails.strYoutube} target="_blank" rel="noopener noreferrer">
                            Watch on YouTube
                          </a>
                        </p>
                      )}
                      {mealDetails.strSource && (
                        <p>
                          <strong>Source: </strong>
                          <a href={mealDetails.strSource} target="_blank" rel="noopener noreferrer">
                            Original Recipe
                          </a>
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default CookingPage
