import { NextRequest, NextResponse } from "next/server"
import { firestore } from "../../../../firebase/server"
import { FieldValue } from "firebase-admin/firestore"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, email, subject, message } = body

    // Validate required fields
    if (!name || !email || !subject || !message) {
      return NextResponse.json(
        { error: "All fields are required" },
        { status: 400 }
      )
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: "Invalid email format" },
        { status: 400 }
      )
    }

    // Get your email from environment variable or use a default
    const recipientEmail = process.env.CONTACT_EMAIL || process.env.ADMIN_EMAIL || ""

    if (!recipientEmail) {
      console.error("CONTACT_EMAIL or ADMIN_EMAIL environment variable not set")
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      )
    }

    // Create document for Firebase Trigger Email extension
    // The extension expects specific fields for email sending
    const contactData = {
      // Email trigger fields (for Firebase Trigger Email extension)
      to: recipientEmail,
      message: {
        subject: `Contact Form: ${subject}`,
        text: `
New contact form submission from ${name} (${email})

Subject: ${subject}

Message:
${message}

---
This message was sent from the contact form on ludo.co.nz
        `.trim(),
        html: `
          <h2>New Contact Form Submission</h2>
          <p><strong>From:</strong> ${name} (${email})</p>
          <p><strong>Subject:</strong> ${subject}</p>
          <h3>Message:</h3>
          <p>${message.replace(/\n/g, "<br>")}</p>
          <hr>
          <p><em>This message was sent from the contact form on ludo.co.nz</em></p>
        `.trim(),
      },
      // Form data fields (as specified in plan)
      name,
      email,
      subject,
      formMessage: message,
      // Timestamp for tracking
      timestamp: FieldValue.serverTimestamp(),
      // Status field (as specified in plan)
      status: "new",
      // Additional metadata
      createdAt: FieldValue.serverTimestamp(),
      read: false,
    }

    // Add document to ContactUs collection
    // This will trigger the Firebase Trigger Email extension
    const docRef = await firestore.collection("ContactUs").add(contactData)

    return NextResponse.json(
      {
        success: true,
        id: docRef.id,
        message: "Contact form submitted successfully",
      },
      { status: 200 }
    )
  } catch (error) {
    console.error("Error submitting contact form:", error)
    return NextResponse.json(
      { error: "Failed to submit contact form" },
      { status: 500 }
    )
  }
}
