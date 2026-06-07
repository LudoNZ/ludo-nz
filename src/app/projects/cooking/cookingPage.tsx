"use client"

import React, { useState } from "react"
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
  "Fish & Chips",
  "Greek Salad",
  "Pumpkin Soup",
]

function randomMeal() {
  return PLACEHOLDER_MEALS[Math.floor(Math.random() * PLACEHOLDER_MEALS.length)]
}

type MealPlan = { day: string; breakfast: string; dinner: string }[]

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
            week of meals using real recipes sourced from TheMealDB open API, and helps you turn that
            plan into a shopping list — so you can walk into the supermarket knowing exactly what you need.
          </p>
          <p>
            This project is in active development. The meal generator below uses placeholder data;
            live API integration, ingredient lists, and user-saved plans via Firestore are coming next.
          </p>
        </div>
      </section>

      <section className={styles.generator}>
        <h2>Meal Plan Generator</h2>
        <p className={styles.generatorSubtitle}>Click to generate a random week of meals</p>
        <button
          className={styles.generateButton}
          onClick={generatePlan}
          disabled={loading}
        >
          {loading ? "Generating..." : "Generate This Week's Plan"}
        </button>

        {mealPlan.length > 0 && (
          <div className={styles.planGrid}>
            {mealPlan.map(({ day, breakfast, dinner }) => (
              <div key={day} className={styles.dayCard}>
                <h3 className={styles.dayName}>{day}</h3>
                <div className={styles.meal}>
                  <span className={styles.mealLabel}>Breakfast</span>
                  <span className={styles.mealName}>{breakfast}</span>
                </div>
                <div className={styles.meal}>
                  <span className={styles.mealLabel}>Dinner</span>
                  <span className={styles.mealName}>{dinner}</span>
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
            <span key={tech} className={styles.techTag}>
              {tech}
            </span>
          ))}
        </div>
      </section>

      <section className={styles.backLink}>
        <Link href="/projects">← Back to Projects</Link>
      </section>
    </div>
  )
}

export default CookingPage
