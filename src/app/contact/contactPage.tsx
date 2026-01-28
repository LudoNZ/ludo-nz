"use client"

import React from "react"
import styles from "./contactPage.module.scss"
import ContactForm from "@/components/contact/contactForm"

const ContactPage: React.FC = () => {
  return (
    <div className={styles.contactPage}>
      <section className={styles.hero}>
        <h1 className={styles.title}>Get In Touch</h1>
        <p className={styles.subtitle}>
          Have a question or want to work together? I&apos;d love to hear from you.
        </p>
      </section>

      <section className={styles.content}>
        <div className={styles.formSection}>
          <ContactForm />
        </div>
      </section>
    </div>
  )
}

export default ContactPage
