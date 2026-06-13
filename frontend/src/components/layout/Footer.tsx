const socialIcons = ['facebook', 'twitter', 'linkedin', 'youtube-play', 'instagram']

export default function Footer() {
  return (
    <div className="py-3 bg-glass footer-copyright">
      <div className="container">
        <div className="row align-items-center justify-content-between">
          <div className="col-auto">
            <span className="me-3 small">
              ©2023 <b className="text-primary">Your Website</b>. All rights reserved
            </span>
          </div>
          <div className="col-auto text-end">
            {socialIcons.map((icon) => (
              <a key={icon} target="_blank" href="#" className="btn social-btn btn-sm text-decoration-none">
                <i className={`icofont-${icon}`}></i>
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
