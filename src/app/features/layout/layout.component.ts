import { Component } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../core/services/auth.service';
import { SesionService } from '../../core/services/sesion.service';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [RouterOutlet, CommonModule],
  templateUrl: './layout.component.html',
  styleUrls: ['./layout.component.scss']
})
export class LayoutComponent {
  constructor(
    private auth: AuthService,
    public sesion: SesionService,
    private router: Router
  ) {}

  get nombre(): string {
    return this.sesion.obtener()?.nombre ?? '';
  }

  salir(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }

  ir(ruta: string): void {
    this.router.navigate([ruta]);
  }

  activa(ruta: string): boolean {
    return this.router.url.startsWith(ruta);
  }
}
