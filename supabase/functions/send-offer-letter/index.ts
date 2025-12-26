import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface OfferLetterData {
  offerLetterId: string;
}

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
  }).format(amount);
}

function generateOfferLetterHTML(offer: any, candidate: any, job: any): string {
  const today = new Date().toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });

  const startDate = new Date(offer.proposed_start_date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const expiryDate = offer.offer_expiry_date 
    ? new Date(offer.offer_expiry_date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })
    : null;

  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: 'Georgia', serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 40px; }
    .header { text-align: center; border-bottom: 2px solid #6366f1; padding-bottom: 20px; margin-bottom: 30px; }
    .logo { font-size: 28px; font-weight: bold; color: #6366f1; }
    .title { font-size: 24px; margin-top: 10px; color: #1f2937; }
    .date { text-align: right; color: #6b7280; margin-bottom: 20px; }
    .section { margin-bottom: 20px; }
    .section-title { font-weight: bold; color: #6366f1; margin-bottom: 10px; }
    .highlight { background-color: #f0f9ff; padding: 20px; border-radius: 8px; margin: 20px 0; }
    .compensation-table { width: 100%; border-collapse: collapse; margin: 15px 0; }
    .compensation-table td { padding: 10px; border-bottom: 1px solid #e5e7eb; }
    .compensation-table td:first-child { font-weight: 600; width: 40%; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 14px; color: #6b7280; }
    .signature-line { margin-top: 50px; }
    .signature-box { display: inline-block; width: 45%; }
    .signature-box .line { border-bottom: 1px solid #333; margin-bottom: 5px; height: 30px; }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">CortexHR</div>
    <div class="title">Employment Offer Letter</div>
  </div>

  <div class="date">${today}</div>

  <div class="section">
    <p>Dear <strong>${candidate.full_name}</strong>,</p>
    <p>We are thrilled to extend this offer of employment to you! After careful consideration, we believe you would be an excellent addition to our team.</p>
  </div>

  <div class="highlight">
    <div class="section-title">Position Details</div>
    <table class="compensation-table">
      <tr>
        <td>Position Title</td>
        <td>${offer.position_title}</td>
      </tr>
      <tr>
        <td>Department</td>
        <td>${offer.department}</td>
      </tr>
      <tr>
        <td>Employment Type</td>
        <td>${offer.employment_type}</td>
      </tr>
      <tr>
        <td>Work Location</td>
        <td>${offer.work_location}</td>
      </tr>
      ${offer.remote_policy ? `
      <tr>
        <td>Remote Policy</td>
        <td>${offer.remote_policy}</td>
      </tr>` : ''}
      ${offer.reporting_manager ? `
      <tr>
        <td>Reporting To</td>
        <td>${offer.reporting_manager}</td>
      </tr>` : ''}
      <tr>
        <td>Proposed Start Date</td>
        <td>${startDate}</td>
      </tr>
    </table>
  </div>

  <div class="highlight">
    <div class="section-title">Compensation Package</div>
    <table class="compensation-table">
      <tr>
        <td>Base Salary</td>
        <td><strong>${formatCurrency(offer.salary_amount, offer.salary_currency)}</strong> ${offer.salary_frequency}</td>
      </tr>
      ${offer.bonus_structure ? `
      <tr>
        <td>Bonus Structure</td>
        <td>${offer.bonus_structure}</td>
      </tr>` : ''}
      ${offer.equity_details ? `
      <tr>
        <td>Equity</td>
        <td>${offer.equity_details}</td>
      </tr>` : ''}
    </table>
  </div>

  ${offer.benefits_package || offer.vacation_days || offer.sick_leave_days ? `
  <div class="section">
    <div class="section-title">Benefits</div>
    ${offer.benefits_package ? `<p>${offer.benefits_package}</p>` : ''}
    <table class="compensation-table">
      ${offer.vacation_days ? `
      <tr>
        <td>Vacation Days</td>
        <td>${offer.vacation_days} days per year</td>
      </tr>` : ''}
      ${offer.sick_leave_days ? `
      <tr>
        <td>Sick Leave</td>
        <td>${offer.sick_leave_days} days per year</td>
      </tr>` : ''}
    </table>
  </div>` : ''}

  <div class="section">
    <div class="section-title">Employment Terms</div>
    <table class="compensation-table">
      ${offer.probation_period_months ? `
      <tr>
        <td>Probation Period</td>
        <td>${offer.probation_period_months} months</td>
      </tr>` : ''}
      ${offer.notice_period_days ? `
      <tr>
        <td>Notice Period</td>
        <td>${offer.notice_period_days} days</td>
      </tr>` : ''}
    </table>
  </div>

  ${offer.additional_notes ? `
  <div class="section">
    <div class="section-title">Additional Information</div>
    <p>${offer.additional_notes}</p>
  </div>` : ''}

  <div class="section">
    <p>This offer is contingent upon successful completion of background verification and any other pre-employment requirements.</p>
    ${expiryDate ? `<p><strong>Please respond to this offer by ${expiryDate}.</strong></p>` : ''}
    <p>To accept this offer, please sign below and return a copy to us. We are excited about the possibility of you joining our team!</p>
  </div>

  <div class="signature-line">
    <div class="signature-box">
      <div class="line"></div>
      <div>Candidate Signature</div>
      <div>${candidate.full_name}</div>
    </div>
    <div class="signature-box" style="float: right;">
      <div class="line"></div>
      <div>Authorized Signatory</div>
      <div>CortexHR</div>
    </div>
  </div>

  <div style="clear: both;"></div>

  <div class="footer">
    <p>This offer letter is subject to the terms and conditions outlined in the employee handbook and company policies.</p>
    <p>If you have any questions, please don't hesitate to reach out to our HR team.</p>
    <p style="text-align: center; margin-top: 20px;">
      <strong>CortexHR</strong> | Where Talent Meets Technology
    </p>
  </div>
</body>
</html>`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Manual auth check (function is public at gateway level)
    const authHeader = req.headers.get('authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Missing Authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const jwt = authHeader.replace('Bearer ', '').trim();
    const { data: { user }, error: userError } = await supabase.auth.getUser(jwt);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid JWT' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: isHrStaff, error: roleError } = await supabase.rpc('is_hr_staff', { _user_id: user.id });
    if (roleError) {
      console.error('Role check failed:', roleError);
      return new Response(
        JSON.stringify({ error: 'Authorization check failed' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!isHrStaff) {
      return new Response(
        JSON.stringify({ error: 'Forbidden' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { offerLetterId }: OfferLetterData = await req.json();

    if (!offerLetterId) {
      return new Response(
        JSON.stringify({ error: 'offerLetterId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    // Fetch offer letter with application, candidate, and job details
    const { data: offer, error: offerError } = await supabase
      .from('offer_letters')
      .select(`
        *,
        applications!inner(
          id,
          candidates!inner(full_name, email),
          jobs!inner(title, department)
        )
      `)
      .eq('id', offerLetterId)
      .single();

    if (offerError || !offer) {
      console.error('Offer letter fetch error:', offerError);
      return new Response(
        JSON.stringify({ error: 'Offer letter not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const candidate = (offer as any).applications.candidates;
    const job = (offer as any).applications.jobs;

    // Generate offer letter HTML
    const offerLetterHTML = generateOfferLetterHTML(offer, candidate, job);

    // Send the email
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    
    let emailSent = false;
    let emailError = null;

    if (resendApiKey) {
      const resendResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${resendApiKey}`,
        },
        body: JSON.stringify({
          from: 'CortexHR <noreply@cortexhr.com>',
          to: [candidate.email],
          subject: `Offer Letter - ${offer.position_title} at CortexHR`,
          html: offerLetterHTML,
        }),
      });

      if (resendResponse.ok) {
        emailSent = true;
        console.log('Offer letter sent successfully via Resend');
      } else {
        emailError = await resendResponse.text();
        console.error('Resend error:', emailError);
      }
    } else {
      console.log('RESEND_API_KEY not configured, logging email instead');
      emailError = 'Email service not configured';
    }

    // Update offer letter status
    await supabase
      .from('offer_letters')
      .update({ 
        status: emailSent ? 'sent' : 'draft',
        sent_at: emailSent ? new Date().toISOString() : null
      })
      .eq('id', offerLetterId);

    // Update application status to 'offer' if email was sent
    if (emailSent) {
      await supabase
        .from('applications')
        .update({ status: 'offer' })
        .eq('id', offer.application_id);
    }

    // Log the email
    await supabase.from('email_logs').insert({
      recipient_email: candidate.email,
      subject: `Offer Letter - ${offer.position_title} at CortexHR`,
      email_type: 'offer_letter',
      status: emailSent ? 'sent' : 'failed',
      candidate_id: null, // We'd need to fetch candidate_id from application
    });

    return new Response(
      JSON.stringify({
        success: emailSent,
        message: emailSent ? 'Offer letter sent successfully' : 'Offer letter saved (email service not configured)',
        offerLetterId,
        candidateName: candidate.full_name,
        candidateEmail: candidate.email
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error sending offer letter:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
