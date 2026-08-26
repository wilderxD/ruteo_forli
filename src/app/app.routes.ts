import { Routes } from '@angular/router';
import { authGuard, rolGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./features/login/login.component').then(m => m.LoginComponent) },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./features/layout/layout.component').then(m => m.LayoutComponent),
    children: [
      {
        path: 'chofer',
        canActivate: [rolGuard(['chofer', 'admin', 'soporte'])],
        loadComponent: () => import('./features/chofer/chofer.component').then(m => m.ChoferComponent)
      },
      {
        path: 'chofer/:placa',
        canActivate: [rolGuard(['chofer', 'admin', 'soporte'])],
        loadComponent: () => import('./features/chofer/chofer.component').then(m => m.ChoferComponent)
      },
      {
        path: 'admin',
        canActivate: [rolGuard(['admin'])],
        loadComponent: () => import('./features/admin/admin.component').then(m => m.AdminComponent)
      },
      {
        path: 'soporte',
        canActivate: [rolGuard(['soporte', 'admin'])],
        loadComponent: () => import('./features/soporte/soporte.component').then(m => m.SoporteComponent)
      },
      {
        path: 'entregas',
        canActivate: [rolGuard(['admin', 'soporte'])],
        loadComponent: () => import('./features/entregas/entregas.component').then(m => m.EntregasComponent)
      },
      { path: '', redirectTo: 'chofer', pathMatch: 'full' }
    ]
  },
  { path: '**', redirectTo: '' }
];
